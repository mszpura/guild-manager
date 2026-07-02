-- Backfill statusu uchwał głosowanych na spotkaniu (rekordy sprzed synchronizacji
-- statusu z cyklem spotkania). Status wyprowadzamy ze stanu punktu porządku obrad.

-- Punkt „do rozpatrzenia" (nieotwarty): uchwała oczekuje na spotkanie.
UPDATE "Resolution" r
SET "status" = 'AWAITING_MEETING', "openedAt" = NULL, "decidedAt" = NULL
FROM "AgendaItem" ai
WHERE ai."resolutionId" = r."id" AND ai."status" = 'PENDING';

-- Punkt odrzucony przez prowadzącego: uchwała odrzucona.
UPDATE "Resolution" r
SET "status" = 'REJECTED', "decidedAt" = COALESCE(r."decidedAt", now())
FROM "AgendaItem" ai
WHERE ai."resolutionId" = r."id" AND ai."status" = 'REJECTED';

-- Punkt zatwierdzony, spotkanie trwa: głosowanie w toku.
UPDATE "Resolution" r
SET "status" = 'VOTING', "openedAt" = COALESCE(r."openedAt", now()), "decidedAt" = NULL
FROM "AgendaItem" ai
JOIN "Meeting" m ON m."id" = ai."meetingId"
WHERE ai."resolutionId" = r."id" AND ai."status" = 'APPROVED' AND m."endedAt" IS NULL;

-- Punkt zatwierdzony, spotkanie zakończone: rozstrzygnięcie wg progu z typu uchwały
-- (udział głosów „za" wśród oddanych ≥ próg; bez typu — zwykła większość).
WITH tally AS (
  SELECT ai."resolutionId" AS rid,
         m."endedAt" AS ended_at,
         rt."voteThreshold" AS threshold,
         COUNT(av."id") FILTER (WHERE av."choice" = 'FOR') AS fors,
         COUNT(av."id") FILTER (WHERE av."choice" = 'AGAINST') AS againsts,
         COUNT(av."id") AS cast_total
  FROM "AgendaItem" ai
  JOIN "Meeting" m ON m."id" = ai."meetingId"
  JOIN "Resolution" res ON res."id" = ai."resolutionId"
  LEFT JOIN "ResolutionType" rt ON rt."id" = res."resolutionTypeId"
  LEFT JOIN "AgendaVote" av ON av."agendaItemId" = ai."id"
  WHERE ai."resolutionId" IS NOT NULL
    AND ai."status" = 'APPROVED'
    AND m."endedAt" IS NOT NULL
  GROUP BY ai."resolutionId", m."endedAt", rt."voteThreshold"
)
UPDATE "Resolution" r
SET "status" = (
      CASE
        WHEN t.threshold IS NOT NULL THEN
          CASE
            WHEN t.cast_total > 0 AND t.fors * 100 >= t.threshold * t.cast_total
            THEN 'PASSED' ELSE 'REJECTED'
          END
        ELSE
          CASE WHEN t.fors > t.againsts THEN 'PASSED' ELSE 'REJECTED' END
      END
    )::"ResolutionStatus",
    "decidedAt" = COALESCE(r."decidedAt", t.ended_at)
FROM tally t
WHERE r."id" = t.rid;

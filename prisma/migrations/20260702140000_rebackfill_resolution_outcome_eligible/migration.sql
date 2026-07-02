-- Ponowne wyznaczenie wyniku uchwał głosowanych na spotkaniu — próg liczony
-- względem liczby UPRAWNIONYCH do głosowania (a nie tylko oddanych głosów),
-- spójnie z paskiem frekwencji. Dotyczy punktów zatwierdzonych na zakończonych
-- spotkaniach.
WITH agg AS (
  SELECT ai."resolutionId" AS rid,
         m."endedAt" AS ended_at,
         rt."voteThreshold" AS threshold,
         COUNT(av."id") FILTER (WHERE av."choice" = 'FOR') AS fors,
         COUNT(av."id") FILTER (WHERE av."choice" = 'AGAINST') AS againsts,
         COUNT(av."id") AS cast_total,
         (
           SELECT COUNT(*)
           FROM "Member" mem
           JOIN "Role" ro ON ro."id" = mem."roleId"
           WHERE mem."organizationId" = m."organizationId"
             AND ro."canVote" = true
             AND (
               NOT EXISTS (
                 SELECT 1 FROM "MeetingTypeRole" mtr
                 WHERE mtr."meetingTypeId" = m."meetingTypeId"
               )
               OR mem."roleId" IN (
                 SELECT mtr."roleId" FROM "MeetingTypeRole" mtr
                 WHERE mtr."meetingTypeId" = m."meetingTypeId"
               )
             )
         ) AS eligible
  FROM "AgendaItem" ai
  JOIN "Meeting" m ON m."id" = ai."meetingId"
  JOIN "Resolution" res ON res."id" = ai."resolutionId"
  LEFT JOIN "ResolutionType" rt ON rt."id" = res."resolutionTypeId"
  LEFT JOIN "AgendaVote" av ON av."agendaItemId" = ai."id"
  WHERE ai."resolutionId" IS NOT NULL
    AND ai."status" = 'APPROVED'
    AND m."endedAt" IS NOT NULL
  GROUP BY ai."resolutionId", m."endedAt", rt."voteThreshold",
           m."organizationId", m."meetingTypeId"
)
UPDATE "Resolution" r
SET "status" = (
      CASE
        WHEN agg.threshold IS NOT NULL THEN
          CASE
            WHEN GREATEST(agg.eligible, agg.cast_total) > 0
                 AND agg.fors * 100 >= agg.threshold * GREATEST(agg.eligible, agg.cast_total)
            THEN 'PASSED' ELSE 'REJECTED'
          END
        ELSE
          CASE WHEN agg.fors > agg.againsts THEN 'PASSED' ELSE 'REJECTED' END
      END
    )::"ResolutionStatus",
    "decidedAt" = COALESCE(r."decidedAt", agg.ended_at)
FROM agg
WHERE r."id" = agg.rid;

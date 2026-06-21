import { redirect } from "next/navigation";

// Strona startowa kieruje do panelu; (app)/layout zajmie się logowaniem
// i wymuszeniem wyboru/utworzenia stowarzyszenia.
export default function Home() {
  redirect("/dashboard");
}

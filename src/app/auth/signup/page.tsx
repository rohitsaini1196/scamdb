import { redirect } from "next/navigation";

// No separate signup — Google OAuth handles both sign in + sign up
export default function SignupPage() {
  redirect("/auth/login");
}

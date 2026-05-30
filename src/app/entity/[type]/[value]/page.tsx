import { redirect } from "next/navigation";

interface Props {
  params: Promise<{ type: string; value: string }>;
}

// Permanent redirect: /entity/phone/X → /phone/X, /entity/upi/X → /upi/X
export default async function EntityRedirect({ params }: Props) {
  const { type, value } = await params;
  if (type === "phone" || type === "upi") {
    redirect(`/${type}/${value}`);
  }
  redirect("/");
}

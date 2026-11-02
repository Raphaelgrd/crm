import GuestDataRoom from "./GuestDataRoom";

export const metadata = {
  title: "Data Room — Netforce",
  robots: { index: false, follow: false },
};

export default async function SharePage({ params }: { params: Promise<{ token: string }> }) {
  return <GuestDataRoom token={(await params).token} />;
}

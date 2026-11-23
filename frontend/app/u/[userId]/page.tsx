import { ProfileView } from "@/components/profile/ProfileView";

export default function MemberPage({ params }: { params: { userId: string } }) {
  return <ProfileView userId={params.userId} />;
}

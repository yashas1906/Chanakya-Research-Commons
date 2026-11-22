import { PostThread } from "@/components/feed/PostThread";

export default function PostPage({ params }: { params: { postId: string } }) {
  return <PostThread postId={params.postId} />;
}

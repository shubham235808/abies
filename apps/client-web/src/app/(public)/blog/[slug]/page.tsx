import Image from 'next/image';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { publishedBlogPostBySlug } from '@abies/domain/modules/content/blog.service';
import { formatBlogDate } from '@/components/content/blog-date';
import { ContentPageBody } from '@/components/content/content-page-body';
import { blogPostMetadata } from '@/lib/seo';

export const dynamic = 'force-dynamic';

type Props = { params: Promise<{ slug: string }> };

export async function generateMetadata({ params }: Props) {
  const { slug } = await params;
  const post = await publishedBlogPostBySlug(slug);
  return post ? blogPostMetadata(post) : {};
}

export default async function BlogPostPage({ params }: Props) {
  const { slug } = await params;
  const post = await publishedBlogPostBySlug(slug);
  if (!post) notFound();

  return (
    <main className="mx-auto max-w-3xl px-6 py-16">
      <Link href="/blog" className="text-sm font-semibold text-brand-magenta-600 hover:underline">
        ← All posts
      </Link>
      <article className="mt-4">
        <h1 className="text-3xl font-semibold text-brand-neutral-900 sm:text-4xl">{post.title}</h1>
        <p className="mt-3 text-sm text-brand-neutral-500">
          {post.authorName} · <time dateTime={post.publishedAt.toISOString()}>{formatBlogDate(post.publishedAt)}</time>
        </p>
        {post.coverImageUrl && (
          <Image
            src={post.coverImageUrl}
            alt=""
            width={1200}
            height={630}
            className="mt-6 h-auto w-full rounded-card object-cover"
            unoptimized
            preload
          />
        )}
        <ContentPageBody body={post.body} />
      </article>
    </main>
  );
}

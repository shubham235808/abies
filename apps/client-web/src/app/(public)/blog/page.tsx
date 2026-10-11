import Image from 'next/image';
import Link from 'next/link';
import { publicPathForBlogPost } from '@abies/domain/modules/content/blog.schemas';
import { publishedBlogPosts } from '@abies/domain/modules/content/blog.service';
import { formatBlogDate } from '@/components/content/blog-date';
import { pageMetadata } from '@/lib/seo';

export function generateMetadata() {
  return pageMetadata('blog');
}

// Reads the DB on every request — a post appears the moment it's published
// (or its scheduled date passes), no rebuild.
export const dynamic = 'force-dynamic';

export default async function BlogIndexPage() {
  const posts = await publishedBlogPosts();

  return (
    <main className="mx-auto max-w-4xl px-6 py-16">
      <p className="text-sm font-semibold uppercase tracking-wide text-brand-magenta-600">Blog</p>
      <h1 className="mt-2 text-3xl font-semibold text-brand-neutral-900 sm:text-4xl">From the ABIES journal</h1>
      {posts.length > 0 ? (
        <div className="mt-8 space-y-6">
          {posts.map((post) => (
            <Link
              key={post.id}
              href={publicPathForBlogPost(post.slug)}
              className="flex flex-col gap-4 rounded-card border border-brand-neutral-200 bg-white p-5 transition hover:border-brand-purple-300 sm:flex-row"
            >
              {post.coverImageUrl && (
                <Image
                  src={post.coverImageUrl}
                  alt=""
                  width={240}
                  height={150}
                  className="h-40 w-full shrink-0 rounded-control object-cover sm:h-[150px] sm:w-60"
                  unoptimized
                />
              )}
              <div className="min-w-0">
                <h2 className="text-xl font-semibold text-brand-neutral-900">{post.title}</h2>
                <p className="mt-1 text-xs text-brand-neutral-500">
                  {post.authorName} · <time dateTime={post.publishedAt.toISOString()}>{formatBlogDate(post.publishedAt)}</time>
                </p>
                <p className="mt-2 text-sm text-brand-neutral-600">{post.excerpt}</p>
              </div>
            </Link>
          ))}
        </div>
      ) : (
        <p className="mt-6 text-sm text-brand-neutral-500">No posts have been published yet.</p>
      )}
    </main>
  );
}

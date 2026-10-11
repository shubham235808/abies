// Rendered on the server, whose clock may be UTC — pinned to IST so a post
// published shortly after midnight in India doesn't show the previous day.
export function formatBlogDate(date: Date): string {
  return date.toLocaleDateString('en-IN', { dateStyle: 'medium', timeZone: 'Asia/Kolkata' });
}

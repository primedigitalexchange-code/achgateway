# On-demand revalidation

This endpoint allows forcing ISR regeneration for the jokes page immediately. It is protected by the `REVALIDATE_SECRET` environment variable.

Usage examples:

- Curl (query param):

  curl -X POST "https://your-domain.com/api/revalidate?secret=YOUR_SECRET"

- Curl (header):

  curl -X POST "https://your-domain.com/api/revalidate" -H "x-revalidate-secret: YOUR_SECRET"

Set REVALIDATE_SECRET in your environment (locally in .env.local or in Vercel environment variables).

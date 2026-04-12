// ============================================================
// CloudFront Function: SPA URL Rewrite for React Router
// ============================================================
//
// This function rewrites all non-file requests to /index.html
// so that React Router can handle client-side routing.
//
// HOW TO DEPLOY:
//   1. Go to AWS CloudFront Console → Functions
//   2. Click "Create function"
//   3. Name: "voltzsupply-spa-rewrite"
//   4. Paste this code
//   5. Click "Save changes" → "Publish"
//   6. Go to your CloudFront distribution → Behaviors
//   7. Edit the default behavior
//   8. Under "Function associations":
//      - Viewer request → CloudFront Functions → voltzsupply-spa-rewrite
//   9. Save changes
//
// This REPLACES the need for custom error pages (403/404 → index.html)
// and is more performant.
// ============================================================

function handler(event) {
  var request = event.request;
  var uri = request.uri;

  // If the URI has a file extension, serve the file as-is
  if (uri.includes('.')) {
    return request;
  }

  // For all other requests (React Router paths), serve index.html
  request.uri = '/index.html';
  return request;
}

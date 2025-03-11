import type { NextPage } from "next"

const ErrorPage: NextPage<{ statusCode?: number }> = ({ statusCode }) => {
  return (
    <div className="flex min-h-screen flex-col items-center justify-center gap-4 text-center">
      <h1 className="text-4xl font-bold">
        {statusCode ? `Error ${statusCode}` : "An error occurred"}
      </h1>
      <p className="text-lg opacity-70">
        {statusCode
          ? `A ${statusCode} error occurred on the server`
          : "An error occurred on the client"}
      </p>
      <a
        href="/dashboard"
        className="inline-flex h-10 items-center justify-center rounded-md bg-primary px-8 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90 focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring disabled:pointer-events-none disabled:opacity-50"
      >
        Return to Dashboard
      </a>
    </div>
  )
}

ErrorPage.getInitialProps = ({ res, err }) => {
  const statusCode = res ? res.statusCode : err ? err.statusCode : 404
  return { statusCode }
}

export default ErrorPage 
import { HelmetProvider, Helmet } from "react-helmet-async";

const PageMeta = ({
  title,
  description,
}: {
  title: string;
  description: string;
}) => (
  <Helmet>
    <title>{title}</title>
    <meta name="description" content={description} />
  </Helmet>
);

export const AppWrapper = ({ children }: { children: React.ReactNode }) => (
  <HelmetProvider>
    <Helmet>
      <link rel="icon" type="image/png" href="/LOGO-IGSS-2025.png" />
      <link rel="apple-touch-icon" href="/LOGO-IGSS-2025.png" />
    </Helmet>
    {children}
  </HelmetProvider>
);

export default PageMeta;

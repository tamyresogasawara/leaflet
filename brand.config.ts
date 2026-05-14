export type DeploymentMode = "demo" | "selfhost";

export type BrandConfig = {
  appName: string;
  logoSrc: string;
  logoMonoSrc: string;
  faviconSrc: string;
  primaryHex: string;
  primaryHoverHex: string;
  accentHex: string;
  pdfFooter: string;
  supportUrl?: string;
  docsUrl?: string;
  repoUrl?: string;
  deploymentMode: DeploymentMode;
};

export const brand: BrandConfig = {
  appName: "Leaflet",
  logoSrc: "/logo.svg",
  logoMonoSrc: "/logo-mono.svg",
  faviconSrc: "/favicon.svg",
  primaryHex: "#4F46E5",
  primaryHoverHex: "#4338CA",
  accentHex: "#047857",
  pdfFooter: "Generated with Leaflet",
  repoUrl: "https://github.com/your-org/leaflet",
  deploymentMode:
    (process.env.NEXT_PUBLIC_DEPLOYMENT_MODE as DeploymentMode | undefined) ??
    "selfhost",
};

import "@/styles/global.css";
import "@/styles/hljs-gruvbox-dark-hard.css";

import dynamic from "next/dynamic";
import { AnchorTag, Layout, VerticalSpacer } from "@/components";
import type { AppProps } from "next/app";
import { MDXProvider } from "@mdx-js/react";

const LightSwitch = dynamic(
  () => import("@/components").then((mod) => mod.LightSwitch),
  {
    ssr: false,
  }
);

const mdComponents = {
  a: (props: any) => <AnchorTag {...props} />,
  VerticalSpacer: (props: any) => <VerticalSpacer {...props} />,
};

export default function App({ Component, pageProps }: AppProps) {
  return (
    <MDXProvider components={mdComponents}>
      <Layout>
        <Component {...pageProps} />
      </Layout>
      <div>&nbsp;</div>
      <LightSwitch />
    </MDXProvider>
  );
}

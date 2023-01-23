import "@/styles/global.css";
import "@/styles/hljs-gruvbox-dark-hard.css";

import dynamic from "next/dynamic";
import AnchorTag from "@/components/AnchorTag";
import type { AppProps } from "next/app";
import { Image, ImageProps } from "@/components/Image";
import Layout from "@/components/Layout";
import { MDXProvider } from "@mdx-js/react";
import VerticalSpacer from "@/components/VerticalSpacer";

const LightSwitch = dynamic(() => import("@/components/LightSwitch"), {
  ssr: false,
});

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

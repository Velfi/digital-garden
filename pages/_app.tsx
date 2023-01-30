import "@/styles/global.css";
import "@/styles/hljs-gruvbox-dark-hard.css";

import dynamic from "next/dynamic";
import { AnchorTag, Layout, VerticalSpacer, Image } from "@/components";
import { Props as ImageProps } from "@/components/Image";
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
  VerticalSpacer: () => <VerticalSpacer />,
  Image: (props: ImageProps) => <Image alt={props.alt} {...props} />,
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

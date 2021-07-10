import "../styles/global.css";
import "../styles/prism-theme-gruvbox-dark.css";

import AnchorTag from "../components/AnchorTag";
import CodeBlock from "../components/CodeBlock";
import Image from "../components/Image";
import Layout from "../components/Layout";
import { LightSwitch } from "../components/LightSwitch";
import { MDXProvider } from "@mdx-js/react";
import siteData from "../siteconfig";

const mdComponents = {
  a: (props) => <AnchorTag {...props} />,
  code: CodeBlock,
  Image: (props) => (
    <div className="nextImageWrapper">
      <Image {...props} />
    </div>
  ),
};

export default function App({ Component, pageProps }) {
  return (
    <MDXProvider components={mdComponents}>
      <Layout siteData={siteData}>
        <Component {...pageProps} />
      </Layout>
      <div>&nbsp;</div>
      <LightSwitch />
    </MDXProvider>
  );
}

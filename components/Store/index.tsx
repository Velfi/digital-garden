import styles from "./styles.module.css";
import { StoreFront } from "./StoreFront";
import { Product } from "./Product";
import { ThumbnailGallery } from "./ThumbnailGallery";
import { ReactElement } from "react";
import { StaticImageData } from "next/image";

import StickerSet1AssortedDalle1 from "@/public/images/store/zelda/sticker-set-1-assorted-dalle-1.jpg";
import StickerSet1AssortedDalle2 from "@/public/images/store/zelda/sticker-set-1-assorted-dalle-2.jpg";
import StickerSet1AssortedDalle3 from "@/public/images/store/zelda/sticker-set-1-assorted-dalle-3.jpg";

import StickerSet2LovelyLizardLadies1 from "@/public/images/store/zelda/sticker-set-2-lovely-lizard-ladies-1.jpg";
import StickerSet2LovelyLizardLadies2 from "@/public/images/store/zelda/sticker-set-2-lovely-lizard-ladies-2.jpg";
import StickerSet2LovelyLizardLadies3 from "@/public/images/store/zelda/sticker-set-2-lovely-lizard-ladies-3.jpg";

import StickerSet3HaecklHexacoralla1 from "@/public/images/store/zelda/sticker-set-6-haeckel-hexacorolla-1.jpg";
import StickerSet3HaecklHexacoralla2 from "@/public/images/store/zelda/sticker-set-6-haeckel-hexacorolla-2.jpg";
import StickerSet3HaecklHexacoralla3 from "@/public/images/store/zelda/sticker-set-6-haeckel-hexacorolla-3.jpg";

import StickerSet4HaecklTetracorolla1 from "@/public/images/store/zelda/sticker-set-7-haeckel-tetracorolla-1.jpg";
import StickerSet4HaecklTetracorolla2 from "@/public/images/store/zelda/sticker-set-7-haeckel-tetracorolla-2.jpg";
import StickerSet4HaecklTetracorolla3 from "@/public/images/store/zelda/sticker-set-7-haeckel-tetracorolla-3.jpg";

interface ProductInfo {
  images: (string | StaticImageData)[];
  name: string;
  purchaseLink: string;
  purchaseCta: string;
  purchaseContents: string;
  description: ReactElement;
}

// In dollars
const STICKER_PACK_PRICE = 15;
const PRODUCTS: ProductInfo[] = [
  {
    images: [
      StickerSet1AssortedDalle1,
      StickerSet1AssortedDalle2,
      StickerSet1AssortedDalle3,
    ],
    name: "Set #1 - Assorted Curiosities",
    purchaseLink: "https://buy.stripe.com/6oE3fL9yXdq7dIk14a",
    purchaseCta: `Click for weird shit`,
    purchaseContents: "18 stickers of various sizes",
    description: (
      <p>
        My first foray into creating stickers. Freaky 👻ghost👻 bed is probably
        my favorite. All images were generated with DALL·E.
      </p>
    ),
  },
  {
    images: [
      StickerSet2LovelyLizardLadies1,
      StickerSet2LovelyLizardLadies2,
      StickerSet2LovelyLizardLadies3,
    ],
    name: "Set #2 - Lovely Lizard Ladies",
    purchaseLink: "https://buy.stripe.com/aEU8A5cL91HpbAc005",
    purchaseCta: "Click to dance with lizards",
    purchaseContents: "9 stickers of various sizes",
    description: (
      <p>
        My second set. I love lizards and dresses, so I combined two of my
        favorite things in this set! I love the gecko wearing the{" "}
        <span className="yellow">yellow</span> bow. All images were generated
        with DALL·E.
      </p>
    ),
  },
  {
    images: [
      StickerSet3HaecklHexacoralla1,
      StickerSet3HaecklHexacoralla2,
      StickerSet3HaecklHexacoralla3,
    ],
    name: "Set #6 - Haeckel Hexacoralla",
    purchaseLink: "https://buy.stripe.com/cN2dUpdPdeubgUwbIP",
    purchaseCta: "Click for corals",
    purchaseContents: "17 monochrome stickers on holographic backing.",
    description: (
      <p>
        I'm a big fan of Ernst Haeckel&apos;s lithographs{" "}
        <em>(and not a fan of his racism)</em>. Here's one of my favorite plates
        from <strong>Kunstformen der Natur</strong> in holographic sticker form:{" "}
        <a href="https://commons.wikimedia.org/wiki/Kunstformen_der_Natur#/media/File:Haeckel_Hexacoralla.jpg">
          "Plate 26: Hexacoralla"
        </a>
        .
      </p>
    ),
  },
  {
    images: [
      StickerSet4HaecklTetracorolla1,
      StickerSet4HaecklTetracorolla2,
      StickerSet4HaecklTetracorolla3,
    ],
    name: "Set #7 - Haeckel Tetracorolla",
    purchaseLink: "https://buy.stripe.com/3csaId12rfyf33G28c",
    purchaseCta: "Click for more corals",
    purchaseContents: "15 monochrome stickers on holographic backing.",
    description: (
      <p>
        Here&apos;s another of Ernst Haeckel's lithographs from{" "}
        <strong>Kunstformen der Natur</strong> in holographic sticker form:{" "}
        <a href="https://commons.wikimedia.org/wiki/Kunstformen_der_Natur#/media/File:Haeckel_Tetracoralla.jpg">
          "Plate 29: Tetracoralla"
        </a>
        .
      </p>
    ),
  },
];

export const Store: React.FC = () => (
  <StoreFront>
    {PRODUCTS.map(
      ({
        name,
        purchaseLink,
        purchaseCta,
        purchaseContents,
        images,
        description,
      }) => (
        <Product
          key={name}
          name={name}
          purchaseLink={purchaseLink}
          purchaseCta={purchaseCta}
          purchasePrice={STICKER_PACK_PRICE}
        >
          <ThumbnailGallery images={images} />
          <p className={styles.purchaseContents}>Includes {purchaseContents}</p>
          {description}
        </Product>
      )
    )}
  </StoreFront>
);

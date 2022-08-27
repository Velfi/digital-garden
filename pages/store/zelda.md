import StoreFront from '../../components/Store/StoreFront'
import Product from '../../components/Store/Product'
import ThumbnailGallery from '../../components/Store/ThumbnailGallery'

# Zelda's Store

> **A note from Zelda:** I kept things simple when coding this store up meaning you can only purchase sticker set per transaction. If you hate this, send an email to **store** *at* **zeldas** *dot* **page** and we'll figure something out.

Thanks for checking out my personal store. I ship all stickers using USPS to anywhere in the US and they should take 1-2 weeks to arrive **(shipping costs are included in the price.)** I print, laminate, and cut the stickers myself. They may fade if left outside for a long time and the laminate may not protect against all liquids. If you feel like I did you dirty at any point, send an email with your order info and your grievance to **store** *at* **zeldas** *dot* **page**.

> **A note from Zelda:** Each image is actually a gallery. You can click on the left or right side of an image to see some extra previews and you can click in the middle to see the full size image. The stickers are shown on my cutting mat which has a 1-inch grid to give you an idea of the size.

<StoreFront>
  <Product
    name="Set #1 - Assorted Curiosities"
    purchaseLink="https://buy.stripe.com/dR63fLaD14TBeMo8ww"
    purchaseText="Click for weird shit ($20)"
>
    <ThumbnailGallery images={[
      "/images/store/zelda/sticker-set-1-assorted-dalle-1.jpg",
      "/images/store/zelda/sticker-set-1-assorted-dalle-2.jpg",
      "/images/store/zelda/sticker-set-1-assorted-dalle-3.jpg"
    ]}/>
  <p>My first foray into creating stickers. Freaky 👻ghost👻 bed is probably my favorite. Includes 18 stickers of various sizes. All images were generated with DALL·E.</p>
  </Product>
  <Product
    name="Set #2 - Lovely Lizard Ladies"
    purchaseLink="https://buy.stripe.com/7sIdUpeThdq76fSdQR"
    purchaseText="Click to dance with lizards ($20)"
  >
    <ThumbnailGallery images={[
      "/images/store/zelda/sticker-set-2-lovely-lizard-ladies-1.jpg",
      "/images/store/zelda/sticker-set-2-lovely-lizard-ladies-2.jpg",
      "/images/store/zelda/sticker-set-2-lovely-lizard-ladies-3.jpg",
    ]}/>
    <p>My second set. I love lizards and dresses, so I combined two of my favorite things in this set! I love the gecko wearing the <span className="yellow">yellow</span> bow. Includes 9 stickers of various sizes. All images were generated with DALL·E.</p>
  </Product>
</StoreFront>

*All designs copyright IF YOU KNOW, YOU KNOW L.L.C. 2022*

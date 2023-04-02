---
title: I Ching
description: A Rust library for divination using the I Ching.
keywords: rust, programming, i ching, divination
---

The source code is available on [GitHub]
This is a published Rust [crate]

This library contains methods for divination using the I Ching. The related CLI app was inspired
by the original [ching(6)](http://cfcl.com/ching/man/) unix program.

The I Ching (a.k.a. the _Book of Changes_) is an ancient method of divination based on
cleromancy (assigning meaning to the generation of apparently random numbers.) Six numbers
between 6 and 9 are generated in order to create a hexagram, the meaning of which is
contained in the I Ching book.

You can find lots of great information on the 2000+ year history of the I Ching on
[Wikipedia](https://en.wikipedia.org/wiki/I_Ching)

## Installing and running the CLI app

To install the CLI app, just run

```sh
cargo install iching
```

Once installed, you can access the help screen by running the CLI with no arguments. Use the `divine`
command to receive a fortune:

![An example fortune from the CLI app](/images/programming/iching/iching-example-1.png)

If you find any issues, please submit them through Github.

## A simplified example of using the library:

```rust
use iching::{Hexagram, HexagramOrdering, HexagramRepository};

// Implementing the HexagramRepository trait is the most complex
// aspect of using this library. See the included CLI app for an
// example implementation called HexagramExampleRepository.
type Repository<'a> = &'a mut dyn HexagramRepository<HexagramInfo = HexagramExampleInfo>;
let hexagrams: Repository = &mut HexagramExampleRepository::new();

// Don't forget to initialize repository after construction, else
// it could fail to work or even panic.
hexagrams
    .initialize()
    .expect("Initialization of hexagrams has failed");

// Create a new random hexagram.
let new_hexagram = Hexagram::from_coin_tosses();
// Get the number of the hexagram according to changing lines and ordering
let hexagram_number = new_hexagram.as_number(false, HexagramOrdering::KingWen);

// Fetch the hexagram's info from the repository that was initialized earlier.
let hexagram_info = hexagrams
    .get_by_number(hexagram_number)
    .expect("Failed to get hexagram info by number (pre)");

// Print the hexagram info for the user
print!("{hexagram_info:?}");
```

[crate]: https://crates.io/crates/iching/
[ching(6)]: http://cfcl.com/ching/man/
[wikipedia]: https://en.wikipedia.org/wiki/I_Ching
[GitHub]: https://github.com/Velfi/i-ching

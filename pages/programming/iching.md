# I Ching

[crates.io/crates/iching/][crates-link]

This library contains methods for divination using the I Ching and also includes a CLI app
for making predictions in your terminal. The CLI app was inspired by the original
[ching(6)] Unix app.

The I Ching (a.k.a. the _Book of Changes_) is an ancient method of divination based on
cleromancy (assigning meaning to the generation of apparently random numbers.) Six numbers
between 6 and 9 are generated in order to create a hexagram, the meaning of which is
contained in the I Ching book.

You can find lots of great information on the 2000+ year history of the I Ching on [Wikipedia]

## Using the CLI app

To install this crate as a CLI app, just run

```sh
cargo install iching
```

_This assumes that you have Rust installed on your machine._

Once installed, you can access the help screen with the `--help` flag:

```sh
iching --help
```

This project is a work in progress. If you find any issues, please submit them through GitHub.

## Using the crate

```rust
fn main() {
   // Implementing the HexagramRepository trait is the most complex
   // aspect of using this library. See the included CLI app for an
   // example implementation called HexagramJson.
   let mut hexagrams: HexagramRepository = HexagramJson::new();

   // Don't forget to initialize repository after construction, else
   // it could fail to work or even panic.
   hexagrams.initialize().expect("Initialization of hexagrams has failed");

   // Create a new random hexagram.
   let new_hexagram = Hexagram::from_coin_tosses();

   // Get the number of the hexagram according to changing lines and ordering
   let hexagram_number = new_hexagram.as_number(false, HexagramOrdering::KingWen);

   // Fetch the hexagram's info from the repository that was initialized earlier.
   let hexagram_info = hexagrams.get_by_number(hexagram_number)
                                .expect("Failed to get hexagram info by number (pre)");

   // Print the hexagram info
   print!("{}", hexagram_info);
}
```

[crates-link]: https://crates.io/crates/iching/
[ching(6)]: http://cfcl.com/ching/man/
[Wikipedia]: https://en.wikipedia.org/wiki/I_Ching

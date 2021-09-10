# Time off between jobs

On August 20th, 2021 I left my job at Tempus for a job at AWS working on the AWS Rust SDK. In the between, I took 24 days for leisure time and personal projects. This page is a chronicle of that period.

## August 17th

I rate my own discipline as pretty low, and my attention span isn't much better. I'm compelled to create things because I crave the validation of others. I'm going into this time off with a desire to create something neat and better myself.

I hope to achieve three things:

- I have been following [Raph Levien]'s work for a while now and was reminded of [`druid`][druid] today while reading a thread on orange website. I'd like to build a puzzle game like [Gunpey] with `druid` since everybody's already done Tetris.
  - Bonus points if I can turn this learning experience into a tutorial article.
- I've really been enjoying the outputs of my [[plotlings]]. I'd like to add another generator to it but I'm not sure what yet. I'll likely pick something out that looks nice and the try to recreate it. I'm also interested in implementing a generator that uses Poisson-Disc sampling to do something neat.
  - [Generative Art Python Tutorial for Penplotter]
  - [Aesthetically Pleasing Triangle Subdivision]
  - [Elementary Cellular Automata]
  - [Poisson-Disc Sampling]
  - [Sampling with Polyominoes]
- I want to write, record, and publish (on [YouTube]) a 3-5 minute song. I made a cool bell sound after watching David Bruce's [Why are Composers so Obsessed by Bells?] video and I want to do something with it. My last "song" was all on the Lyra-8 so it's possible I'll bang out another noodle on that noisemaker.
 
### How to build a Gunpey

I think this task will be the most difficult because I've never used `druid` before and the [instructional book] is incomplete. I'm counting on my past experience with creating GUIs for the web and the work I've done with [`conrod`][conrod] for my plotter art generators. If I run into too much trouble, I can switch over to a more familiar framework like [`ggez`][ggez], [`nannou`][nannou], or even [`pixels`][pixels]. This project is also a good opportunity to work on graph traversal algorithms. The object of the game is to build an unbroken line from the left of the screen to the right. An individual segment of the line is valid if it's connected on both sides to either another line or a screen edge. Building that solver will be the first thing that I tackle.

## August 23rd

I was right to guess that learning Druid would be difficult but that's only been true for some aspects of it. My past experience making websites with React has been helpful overall but I've still made a few mistakes that I could have avoided.
Just like React, Druid UI are declarative. The "view" that users see and interact with is constructed from a central blob of "state". Druid tracks what state each widget (component in React) relies on and re-renders widgets when state is changed.
Just like React, it's easy to misunderstand what constitutes a change and what doesn't.

### State changes in React

*(This part applies to older Class-style React components. The new method of using hooks to manage state has it's own set of footguns)*

If you've used React, you may have been bitten by this because of how JavaScript handles equality comparisons between objects.
When comparing objects, JS only compares the pointers for those objects and disregards the values they contain.

e.g.

```javascript
let objA = {
  bestKaiju: "Biolante",
};
let objB = {
  bestKaiju: "Biolante",
};

console.assert(objA === objA, "This is true");
console.assert(objA.bestKaiju === objB.bestKaiju, "This is true");
console.assert(objA === objB, "This is false");
```

What this means in React is that if you directly modify the object where you store your state, React will think that nothing has changed because JavaScript says that the pointer to the object is still the same:

```javascript
class Foo extends React.Component {
  constructor(props) {
    super(props);
    this.state = { name: "world" };
  }

  handleNameChange() {
    // Modifying the state object like this is a no-no.
    // React will never notice that this was changed.
    this.state.name = "Zelda";
  }

  render() {
    return (
      <div>
        <h1>Hello, {this.state.name}!</h1>
        <button onClick={handleNameChange}>change name</button>
      </div>
    );
  }
}
```

In order to make the change noticeable, a new object has to be created to replace the old one:

```javascript
  handleNameChange() {
    // Creating a new object like this is a noticeable change
    this.state = { name: "Zelda"};
    // React also provides a nice function to call to make state changes
    // this.setState({ name: "Zelda"});
  }
```

*(for more info on React state, see [here][React State FAQ])*

Druid works in much the same way.

### State changes in Druid

In Druid, the [Data trait] is responsible for defining how state containers should be compared. One of the default `impl`s of Data is for `Arc` which ends up working exactly like the JavaScript object pointer comparison mentioned earlier.
Whatever is defined as state is cloned often and it's up to the user to either make sure that your state itself is cheap-to-clone or that your expensive-to-clone state is behind a cheap-to-clone `Arc`.
Before I had internalized this, I ran into some roadblocks with widgets that didn't want to update even though I thought that I had changed their state.

### Where I'm currently at

I made a good amount of progress over the weekend and have actually taken a liking to Druid in spite of my confusion.

<Image src="/images/thoughts/24-days-between-jobs/gunpey-in-progress-1.png" alt="Gunpey game dev progress example depicting results of a partially-correct graph algorithm" width="302" height="453" subtitle="The graph algorithm is having some trouble" />
<VerticalSpacer/>

I've added a start screen and a game screen to the app. The game screen has a few buttons for testing the score meter and adding rows to the game board.
Grid cells can be swapped and connections are usually calculated correctly although it also misses a few valid connections in the above screenshot.
The tests pass so I'm wondering if it's an issue with the Druid widget I created to represent the game grid. This has definitely been one of the most difficult projects I've attempted and I'm definitely planning on turning this experience into a tutorial for aspiring Rust game developers. I'm going to continue on with Druid for the next few days but I'm still considering the option of switching it out for a framework that I'm more experienced with.

## August 30th

I spent most of the past week working on music and playing videogames. I've been putting effort into learning the [Octatrack] and it's starting to pay off although the device feels no less arcane. I have another piece I started in Ableton that needs polish but it's also a candidate for my "write a song" goal. More on this to come.

## September 8th

It's almost the end of my time between jobs. I have spent a large amount of the time just chillin and I've beaten a few adventure games:

- [Myst (2021 Remake)]
  - I played Myst as a child and have had a love of adventure games ever since. In my youth, I hadn't actually been able to beat it without resorting to a walkthrough. This time I got through it all myself with the new "randomizer" option enabled. It's a fun, if short game. I'd definitely recommend it to anyone that remembers it from their childhood.
- [Obduction]
  - The most recently released game by the Myst developers. I bounced off this one when it came out in 2016 and I wanted to revisit it and beat it to experience the full story. I did manage that this time and I found a few of the later puzzles really tedious. I'm of the opinion that a good adventure game puzzle is one that's easily solvable once you know the answer. Several puzzles in Obduction required waiting through long chains of animations and the game's unique mechanic (which I won't spoil) also adds significant overhead to puzzle completion times. That being said, I liked the story and I'm very much looking forward to Cyan World's next game [Firmament]. I might finally purchase a VR headset for that one.
- [Quern: Undying Thoughts]
  - A game made by four Hungarian university students that's surprisingly good. The developers are clear fans of Myst and Riven and it really shows in both the visual style and the puzzle designs. I recommend this game to anyone that likes puzzlers, although it's not without its faults. I found some of the puzzles a little tedious and there's a good amount of backtracking necessary. Still, the game teaches you how to succeed at most puzzles instead of throwing one-off brain teasers at you and it does a good job of reusing puzzle concepts throughout the game while expanding on them whenever they reappear. Go buy the game and don't feel bad if you need walkthrough to get past any places where you feel stuck. The developers try to telegraph where you need to go in the game but I missed the signs a few times and would have been completely stuck without the internet.

### Gunpey graph algorithm progress

The graph algorithm for determining connection is now fully working and correct:

<Image src="/images/thoughts/24-days-between-jobs/gunpey-in-progress-2.png" alt="Gunpey game dev progress example depicting results of a correct graph algorithm" width="291" height="488" subtitle="(compare this screenshot to the previous update)" />
<VerticalSpacer/>

The breakthrough that made this possible was focusing on the grid as a bunch of corners. Focusing on the cells alone made it easy to reason about cells that formed a chain between the left and right sides but it made considering how the cells were actually connected difficult. Changing the focus to the corners of cells made it possible to focus on that important missing piece.

<Image src="/images/thoughts/24-days-between-jobs/gunpey_graph_explainer_1.svg" alt="Gunpey graph explainer" width="679.3" height="285.7" layout="responsive" subtitle="in the corner-wise diagram, it's easy to see the unconnected end at (3,2)" />

My friend Tess was instrumental in creating the final algorithm based on this method. I'll write about exactly how it works as part of a separate tutorial article.

### Music

I put some more polish on the song I was working on but I want to add a second part to it based on a suggestion from my piano teacher. I swear I'm actually going to share it at some point.

## September 10th

I created a new plotling called [Line Noise] and made a print with it:

<Image src="/images/thoughts/24-days-between-jobs/line_noise.jpg" alt="A photograph of a plotter print depicting the results of the Line Noise art generator" width="1512" height="2016" />
<VerticalSpacer/>

[Raph Levien]: https://www.levien.com/
[druid]: https://github.com/linebender/druid
[Gunpey]: https://en.wikipedia.org/wiki/Gunpey
[Generative Art Python Tutorial for Penplotter]: https://www.generativehut.com/post/generative-art-python-tutorial-for-penplotter
[Aesthetically Pleasing Triangle Subdivision]: https://tylerxhobbs.com/essays/2017/aesthetically-pleasing-triangle-subdivision
[Elementary Cellular Automata]: https://en.wikipedia.org/wiki/Elementary_cellular_automaton
[Poisson-Disc Sampling]: https://www.jasondavies.com/poisson-disc/
[Sampling with Polyominoes]: http://www.iro.umontreal.ca/~ostrom/publications/pdf/SIGGRAPH07_SamplingWithPolyominoes.pdf
[YouTube]: https://www.youtube.com/channel/UCyNZpS6zSdLjJtyTBYSt32A
[Why are Composers so Obsessed by Bells?]: https://www.youtube.com/watch?v=Ii3BwiU7leg
[instructional book]: https://linebender.org/druid/
[conrod]: https://github.com/PistonDevelopers/conrod
[ggez]: https://github.com/ggez/ggez
[nannou]: https://github.com/nannou-org/nannou
[pixels]: https://github.com/parasyte/pixels
[React State FAQ]: https://reactjs.org/docs/faq-state.html
[Data trait]: https://docs.rs/druid/0.7.0/druid/trait.Data.html
[Octatrack]: https://www.elektron.se/products/octatrack-mkii/
[Obduction]: https://store.steampowered.com/app/306760/Obduction/
[Quern: Undying Thoughts]: https://store.steampowered.com/app/512790/Quern__Undying_Thoughts/
[Myst (2021 Remake)]: https://store.steampowered.com/app/1255560/Myst/
[Firmament]: https://fulfillment.fangamer.com/kindling/firmament
[Line Noise]: https://github.com/Velfi/plotlings#line-noise

[//begin]: # "Autogenerated link references for markdown compatibility"
[plotlings]: ../programming/plotlings "Plotter Art Generation Suite"
[//end]: # "Autogenerated link references"

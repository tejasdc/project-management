import { useState, type CSSProperties } from "react";

const selectionMessage = {
  task: "Task source: I need to sketch the first version on Friday.",
  decision: "Decision source: Let's keep the homepage focused on a single example.",
  insight: "Insight source: People understand it faster when they see their own words become something useful.",
};

export function Homepage() {
  const [selected, setSelected] = useState<keyof typeof selectionMessage>("task");
  return <>
    <link rel="stylesheet" href="/homepage/style.css" />
<a className="skip" href="#main">Skip to content</a>
    <header className="site-header wrap">
      <a className="wordmark" href="/" aria-label="Clarify.pm home">Clarify<span>.pm</span></a>
      <nav aria-label="Main navigation">
        <a href="#idea">The idea</a>
        <a href="/projects">Open workspace <span aria-hidden="true">↗</span></a>
      </nav>
    </header>
    <main id="main">
      <section className="hero wrap" aria-labelledby="headline">
        <div className="hero-copy">
          <p className="eyebrow">A place for work to take shape</p>
          <h1 id="headline">Your notes,<br />with a <span>next step.</span></h1>
          <p className="intro">Capture a thought. Clarify.pm finds the tasks, decisions, and insights, and keeps them connected to their source.</p>
          <a className="button" href="#example">Explore an example <span aria-hidden="true">↗</span></a>
        </div>
        <figure className="hero-image">
          <img src="/homepage/assets/notes-to-order.webp" width="1536" height="1024" fetchPriority="high" alt="Loose paper notes finding their way into three small, organized stacks." />
        </figure>
      </section>
      <section className="example-section wrap" id="example" aria-labelledby="example-heading">
        <div className="section-heading">
          <h2 id="example-heading">A little structure.<br />The whole thought intact.</h2>
          <p>One note can hold something to do, a choice you've made, and something you've learned. Clarify.pm gives each a place.</p>
        </div>
        <div className="example">
          <div className="note" style={{ "--selected": `var(--${selected})`, "--mark": `color-mix(in srgb, var(--${selected}) 13%, transparent)` } as CSSProperties}>
            <div className="note-heading"><span>Original note</span><span>Website refresh</span></div>
            <blockquote>
              <mark className={selected === "decision" ? "selected" : undefined} data-source="decision">Let's keep the homepage focused on a single example.</mark>{" "}
              <mark className={selected === "task" ? "selected" : undefined} data-source="task">I need to sketch the first version on Friday.</mark>{" "}
              <mark className={selected === "insight" ? "selected" : undefined} data-source="insight">People understand it faster when they see their own words become something useful.</mark>
            </blockquote>
            <p className="note-caption">Your words stay attached.</p>
          </div>
          <div className="interpretation">
            <p className="example-instruction" id="example-instruction">Select an item to see its source.</p>
            <div className="items" role="group" aria-describedby="example-instruction" aria-label="Example extracted items">
              <button className="item task" data-item="task" aria-pressed={selected === "task"} onClick={() => setSelected("task")}>
                <span className="type">Task</span>
                <span className="item-title">Sketch the first version</span>
                <span className="item-detail">Friday</span>
                <span className="item-arrow" aria-hidden="true">↖</span>
              </button>
              <button className="item decision" data-item="decision" aria-pressed={selected === "decision"} onClick={() => setSelected("decision")}>
                <span className="type">Decision</span>
                <span className="item-title">Build the homepage around one example</span>
                <span className="item-arrow" aria-hidden="true">↖</span>
              </button>
              <button className="item insight" data-item="insight" aria-pressed={selected === "insight"} onClick={() => setSelected("insight")}>
                <span className="type">Insight</span>
                <span className="item-title">Familiar words make the idea easier to understand</span>
                <span className="item-arrow" aria-hidden="true">↖</span>
              </button>
            </div>
          </div>
        </div>
        <p className="example-caption">A worked example, not a live extraction. Nothing you do here is sent or saved.</p>
        <p id="selection-status" className="sr-only" aria-live="polite">{selectionMessage[selected]}</p>
      </section>
      <section className="idea wrap" id="idea" aria-labelledby="idea-heading">
        <div className="idea-heading">
          <h2 id="idea-heading">Write first.<br />Organize from there.</h2>
          <p>Project management usually starts with a form. Clarify.pm starts with what you're thinking.</p>
        </div>
        <div className="principles">
          <article>
            <h3>Capture without sorting</h3>
            <p>Get the rough thought down while it's there. AI extracts the useful pieces and suggests where they belong.</p>
          </article>
          <article>
            <h3>Keep the context</h3>
            <p>Tasks, decisions, and insights link back to the original note. The interpretation never replaces your words.</p>
          </article>
          <article>
            <h3>Leave room for judgment</h3>
            <p>Uncertain interpretations go to review. Revisit the source, correct a suggestion, or decide where an item belongs.</p>
          </article>
        </div>
      </section>
      <section className="closing wrap" aria-label="About Clarify.pm">
        <p>An experiment in project management<br />that starts with what you already write.</p>
        <a href="https://tejas.nyc/">A project by Tejas <span aria-hidden="true">↗</span></a>
      </section>
    </main>
    <footer className="site-footer wrap"><a className="wordmark" href="/">Clarify<span>.pm</span></a><span>Keep the thought. Find the next step.</span></footer>
  </>;
}

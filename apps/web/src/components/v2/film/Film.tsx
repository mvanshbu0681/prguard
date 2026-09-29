// The launch film, right under the hero: fifteen seconds that show the whole
// product (a repro test written, run at base and head, the merge held). It
// plays muted when it scrolls into view; the chapters below it seek and light
// up as the film reaches them. Server component; the player is the client part.
import { FilmPlayer, type FilmChapter } from "./FilmPlayer";
import s from "./film.module.css";

// Chapter start times match the film's cut (scene.js v2 in the film project).
const CHAPTERS: FilmChapter[] = [
  { at: 4.6, end: 7.0, label: "Writes a repro test", index: "01" },
  { at: 7.0, end: 9.55, label: "Runs it at base and head", index: "02" },
  { at: 9.55, end: 11.9, label: "Holds the merge", index: "03" },
];

export function Film() {
  return (
    <section id="film" className={s.section} aria-labelledby="film-title">
      <div className={s.inner}>
        <p className={`${s.eyebrow} ${s.reveal}`}>
          <span aria-hidden>•</span>Fifteen seconds
        </p>
        <h2 id="film-title" className={`${s.h2} ${s.reveal}`}>
          <span>Watch Witness prove a bug</span>
          <span className={s.grey}>before it reaches main.</span>
        </h2>
        <FilmPlayer
          className={s.reveal}
          src="/marketing/witness-film.mp4"
          srcSmall="/marketing/witness-film-720.mp4"
          poster="/marketing/witness-film-poster.jpg"
          chapters={CHAPTERS}
          label="Witness launch film: an AI review bot's opinion is replaced by a repro test that passes at the base commit, fails at the head commit, and holds the merge."
        />
      </div>
    </section>
  );
}

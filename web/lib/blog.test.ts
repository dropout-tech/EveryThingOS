import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { formatPostDate, getPost, listPosts } from "./blog.ts";

describe("blog", () => {
  it("lists newest posts first and keeps slugs unique", () => {
    const posts = listPosts();
    assert.ok(posts.length >= 4);
    const slugs = posts.map((post) => post.slug);
    assert.equal(new Set(slugs).size, slugs.length);
    const dates = posts.map((post) => post.date);
    assert.deepEqual(dates, [...dates].sort((a, b) => b.localeCompare(a)));
    assert.equal(posts[0]?.slug, "shell-is-live");
  });

  it("finds a post and formats its Taipei calendar date", () => {
    const post = getPost("payroll-blank");
    assert.equal(post?.date, "2026-10-22");
    assert.equal(formatPostDate("2026-10-22"), "2026年10月22日");
    assert.equal(getPost("missing"), undefined);
  });

  it("does not invent a payroll amount or a customer story", () => {
    const text = listPosts().flatMap((post) => [post.title, post.description, ...post.paragraphs]).join("\n");
    assert.equal(text.includes("312,480"), false);
    assert.equal(text.includes("實發先空白"), true);
    assert.equal(text.includes("客戶說"), false);
  });
});

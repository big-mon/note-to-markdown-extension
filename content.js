(function () {
  "use strict";

  const BUTTON_ID = "note-md-copy-button";
  const STATUS_RESET_MS = 1800;
  const ARTICLE_PATH_RE = /^\/[^/]+\/n\/[^/]+/;
  const BODY_SELECTORS = [
    "article [class*=\"note-common-styles__textnote-body\"]",
    "article [class*=\"textnote-body\"]",
    "article [class*=\"TextNoteBody\"]",
    "article [class*=\"note-body\"]",
    "article [data-testid*=\"note-body\"]",
    "article [data-name=\"body\"]",
    "main [class*=\"note-common-styles__textnote-body\"]",
    "main [class*=\"textnote-body\"]",
    "main [data-testid*=\"note-body\"]"
  ];
  const REMOVE_SELECTORS = [
    "script",
    "style",
    "noscript",
    "template",
    "svg",
    "canvas",
    "iframe",
    "button",
    "input",
    "textarea",
    "select",
    "nav",
    "header",
    "footer",
    "aside",
    "[role=\"navigation\"]",
    "[aria-hidden=\"true\"]",
    "[class*=\"Header\"]",
    "[class*=\"Footer\"]",
    "[class*=\"Share\"]",
    "[class*=\"Like\"]",
    "[class*=\"Comment\"]",
    "[class*=\"Recommend\"]",
    "[class*=\"Profile\"]",
    "[class*=\"Creator\"]",
    "[class*=\"TagList\"]",
    "[data-testid*=\"share\"]",
    "[data-testid*=\"like\"]",
    "[data-testid*=\"comment\"]",
    "[data-testid*=\"tag\"]"
  ];
  const STOP_TEXT_RE = /^(いいなと思ったら応援しよう|チップで応援する|この記事はnote|この記事は\s*note)/;
  const BLOCK_TAGS = new Set([
    "ADDRESS",
    "ARTICLE",
    "ASIDE",
    "BLOCKQUOTE",
    "DD",
    "DETAILS",
    "DIV",
    "DL",
    "DT",
    "FIELDSET",
    "FIGCAPTION",
    "FIGURE",
    "FOOTER",
    "FORM",
    "H1",
    "H2",
    "H3",
    "H4",
    "H5",
    "H6",
    "HEADER",
    "HR",
    "LI",
    "MAIN",
    "NAV",
    "OL",
    "P",
    "PRE",
    "SECTION",
    "TABLE",
    "UL"
  ]);

  let currentUrl = location.href;

  function isArticlePage() {
    return location.hostname === "note.com" && ARTICLE_PATH_RE.test(location.pathname);
  }

  function ensureButton() {
    const existing = document.getElementById(BUTTON_ID);
    if (!isArticlePage()) {
      existing?.remove();
      return;
    }

    if (existing) {
      return;
    }

    const button = document.createElement("button");
    button.id = BUTTON_ID;
    button.type = "button";
    button.textContent = "Markdownコピー";
    button.setAttribute("aria-label", "この記事をMarkdownとしてコピー");
    button.addEventListener("click", onCopyClick);
    document.documentElement.appendChild(button);
  }

  async function onCopyClick(event) {
    const button = event.currentTarget;
    setButtonState(button, "copying", "コピー中...");

    try {
      const markdown = buildMarkdown();
      await writeToClipboard(markdown);
      setButtonState(button, "success", "コピーしました");
    } catch (error) {
      console.error("[note-md-copy]", error);
      setButtonState(button, "error", "コピー失敗");
    }
  }

  function setButtonState(button, state, label) {
    button.dataset.state = state;
    button.textContent = label;

    if (state === "success" || state === "error") {
      window.setTimeout(() => {
        if (button.isConnected) {
          button.dataset.state = "";
          button.textContent = "Markdownコピー";
        }
      }, STATUS_RESET_MS);
    }
  }

  async function writeToClipboard(text) {
    if (navigator.clipboard?.writeText) {
      await navigator.clipboard.writeText(text);
      return;
    }

    const textarea = document.createElement("textarea");
    textarea.value = text;
    textarea.style.position = "fixed";
    textarea.style.left = "-9999px";
    textarea.style.top = "0";
    document.body.appendChild(textarea);
    textarea.focus();
    textarea.select();

    try {
      if (!document.execCommand("copy")) {
        throw new Error("document.execCommand(\"copy\") returned false.");
      }
    } finally {
      textarea.remove();
    }
  }

  function buildMarkdown() {
    const article = findArticleContainer();
    const metadata = extractMetadata(article);
    const bodyRoot = findBodyRoot(article);
    const bodyClone = prepareBodyClone(bodyRoot, metadata);
    const context = {
      seenImageUrls: new Set(metadata.thumbnailUrl ? [normalizeComparableUrl(metadata.thumbnailUrl)] : [])
    };
    const body = normalizeMarkdown(blockChildrenToMarkdown(bodyClone, context));

    if (!metadata.title) {
      throw new Error("Article title was not found.");
    }

    return normalizeMarkdown([frontMatter(metadata), body].filter(Boolean).join("\n\n"));
  }

  function frontMatter(metadata) {
    return [
      "---",
      `title: ${yamlString(metadata.title)}`,
      `URL: ${yamlString(location.href)}`,
      `PublishedDate: ${yamlString(metadata.published)}`,
      `thumbnailImage: ${yamlString(metadata.thumbnailUrl)}`,
      "---"
    ].join("\n");
  }

  function yamlString(value) {
    return `"${String(value || "").replace(/\\/g, "\\\\").replace(/"/g, "\\\"")}"`;
  }

  function findArticleContainer() {
    return document.querySelector("article") || document.querySelector("main") || document.body;
  }

  function extractMetadata(article) {
    const title =
      cleanText(article?.querySelector("h1")?.textContent) ||
      cleanTitleFromMeta(getMeta("property", "og:title")) ||
      cleanText(document.title);
    const author =
      getMeta("name", "author") ||
      findAuthorName(article) ||
      authorFromTitle(getMeta("property", "og:title") || getMeta("property", "twitter:title") || document.title) ||
      "";
    const time = article?.querySelector("time") || document.querySelector("time");
    const published =
      cleanText(time?.getAttribute("datetime")) ||
      cleanText(time?.textContent) ||
      getMeta("property", "article:published_time") ||
      "";
    const thumbnailUrl = absolutizeUrl(getMeta("property", "og:image") || getFirstImageUrl(article));

    return {
      title,
      author: cleanText(author),
      published: cleanText(published),
      thumbnailUrl
    };
  }

  function getMeta(attribute, value) {
    return cleanText(document.querySelector(`meta[${attribute}="${value}"]`)?.getAttribute("content"));
  }

  function cleanTitleFromMeta(value) {
    return cleanText(value.replace(/\s*[|｜]\s*note(?:\s*\(.+\))?$/i, ""));
  }

  function authorFromTitle(value) {
    const match = cleanText(value).match(/[|｜]\s*([^|｜]+)$/);
    return match ? cleanText(match[1].replace(/^note(?:\s*\(.+\))?$/i, "")) : "";
  }

  function findAuthorName(article) {
    const links = Array.from((article || document).querySelectorAll("a[href^=\"/\"]"));

    for (const link of links) {
      const text = cleanText(link.textContent);
      const href = link.getAttribute("href") || "";

      if (text && /^\/[^/?#]+\/?$/.test(href) && text.length <= 80) {
        return text;
      }
    }

    return "";
  }

  function getFirstImageUrl(root) {
    const image = root?.querySelector("img");
    return image ? getImageUrl(image) : "";
  }

  function findBodyRoot(article) {
    for (const selector of BODY_SELECTORS) {
      const element = document.querySelector(selector);
      if (element && visibleTextLength(element) > 0) {
        return element;
      }
    }

    const root = article || document.querySelector("main") || document.body;
    const candidates = Array.from(root.querySelectorAll("section, div, article, main")).filter(isUsableBodyCandidate);
    let best = root;
    let bestScore = scoreBodyCandidate(root);

    for (const candidate of candidates) {
      const score = scoreBodyCandidate(candidate);
      if (score > bestScore) {
        best = candidate;
        bestScore = score;
      }
    }

    return best;
  }

  function isUsableBodyCandidate(element) {
    return Boolean(element && visibleTextLength(element) >= 160);
  }

  function scoreBodyCandidate(element) {
    if (!element) {
      return -Infinity;
    }

    const className = String(element.className || "");
    const id = String(element.id || "");
    const marker = `${className} ${id}`.toLowerCase();
    let score = visibleTextLength(element);
    score += element.querySelectorAll("p").length * 40;
    score += element.querySelectorAll("h2, h3, h4").length * 80;
    score += element.querySelectorAll("li").length * 20;
    score += element.querySelectorAll("blockquote").length * 50;
    score += element.querySelectorAll("img").length * 30;

    if (element.querySelector("h1")) {
      score -= 250;
    }

    if (/(footer|header|profile|comment|recommend|tag|share|like|sidebar)/.test(marker)) {
      score -= 1000;
    }

    const linkTextLength = Array.from(element.querySelectorAll("a")).reduce((sum, link) => {
      return sum + visibleTextLength(link);
    }, 0);
    const textLength = Math.max(visibleTextLength(element), 1);
    if (linkTextLength / textLength > 0.45) {
      score -= 500;
    }

    return score;
  }

  function prepareBodyClone(root, metadata) {
    const clone = root.cloneNode(true);
    removeUnwantedNodes(clone);
    removeDuplicateMetadata(clone, metadata);
    return clone;
  }

  function removeUnwantedNodes(root) {
    for (const selector of REMOVE_SELECTORS) {
      root.querySelectorAll(selector).forEach((node) => node.remove());
    }
  }

  function removeDuplicateMetadata(root, metadata) {
    root.querySelectorAll("h1").forEach((heading) => {
      if (cleanText(heading.textContent) === metadata.title) {
        heading.remove();
      }
    });
    root.querySelectorAll("time").forEach((time) => time.remove());
    root.querySelectorAll("a, span").forEach((element) => {
      if (metadata.author && cleanText(element.textContent) === metadata.author) {
        element.remove();
      }
    });
  }

  function blockChildrenToMarkdown(root, context) {
    const chunks = [];

    for (const child of root.childNodes) {
      const result = nodeToMarkdown(child, context, { listDepth: 0, inline: false });
      if (result.stop) {
        break;
      }
      if (result.text) {
        chunks.push(result.text);
      }
    }

    return chunks.join("\n\n");
  }

  function nodeToMarkdown(node, context, options) {
    if (node.nodeType === Node.TEXT_NODE) {
      return { text: cleanInlineText(node.textContent), stop: false };
    }

    if (node.nodeType !== Node.ELEMENT_NODE) {
      return { text: "", stop: false };
    }

    const element = node;
    if (shouldSkipElement(element)) {
      return { text: "", stop: false };
    }

    const ownText = cleanText(element.textContent);
    if (!options.inline && STOP_TEXT_RE.test(ownText)) {
      return { text: "", stop: true };
    }

    const tag = element.tagName;
    switch (tag) {
      case "BR":
        return { text: options.inline ? "  \n" : "\n", stop: false };
      case "HR":
        return { text: "---", stop: false };
      case "IMG":
        return { text: imageToMarkdown(element, context), stop: false };
      case "A":
        return { text: linkToMarkdown(element, context), stop: false };
      case "STRONG":
      case "B":
        return { text: wrapInline(element, context, "**"), stop: false };
      case "EM":
      case "I":
        return { text: wrapInline(element, context, "*"), stop: false };
      case "CODE":
        if (element.closest("pre")) {
          return { text: cleanText(element.textContent), stop: false };
        }
        return { text: inlineCode(cleanText(element.textContent)), stop: false };
      case "PRE":
        return { text: fencedCode(element), stop: false };
      case "BLOCKQUOTE":
        return { text: quoteMarkdown(element, context, options), stop: false };
      case "UL":
      case "OL":
        return { text: listMarkdown(element, context, options), stop: false };
      case "LI":
        return { text: listItemMarkdown(element, context, options, "-"), stop: false };
      case "H1":
      case "H2":
      case "H3":
      case "H4":
      case "H5":
      case "H6":
        return { text: headingMarkdown(element, context), stop: false };
      case "P":
      case "FIGCAPTION":
        return { text: inlineChildrenToMarkdown(element, context), stop: false };
      case "FIGURE":
        return figureMarkdown(element, context, options);
      case "TABLE":
        return { text: tableMarkdown(element), stop: false };
      default:
        return containerMarkdown(element, context, options);
    }
  }

  function shouldSkipElement(element) {
    if (element.id === BUTTON_ID) {
      return true;
    }
    if (element.matches("script, style, noscript, template, svg, canvas, button, input, textarea, select")) {
      return true;
    }
    if (element.getAttribute("aria-hidden") === "true") {
      return true;
    }
    const style = window.getComputedStyle(element);
    return style.display === "none" || style.visibility === "hidden";
  }

  function inlineChildrenToMarkdown(element, context) {
    return cleanInlineText(Array.from(element.childNodes).map((child) => {
      return nodeToMarkdown(child, context, { listDepth: 0, inline: true }).text;
    }).join(""));
  }

  function blockChildResults(element, context, options) {
    const chunks = [];

    for (const child of element.childNodes) {
      const result = nodeToMarkdown(child, context, { ...options, inline: false });
      if (result.stop) {
        return { text: chunks.join("\n\n"), stop: true };
      }
      if (result.text) {
        chunks.push(result.text);
      }
    }

    return { text: chunks.join("\n\n"), stop: false };
  }

  function containerMarkdown(element, context, options) {
    const hasBlockChild = Array.from(element.children).some((child) => BLOCK_TAGS.has(child.tagName));

    if (!hasBlockChild) {
      return { text: inlineChildrenToMarkdown(element, context), stop: false };
    }

    return blockChildResults(element, context, options);
  }

  function headingMarkdown(element, context) {
    const level = Number(element.tagName.slice(1));
    const text = inlineChildrenToMarkdown(element, context);
    return text ? `${"#".repeat(level)} ${text}` : "";
  }

  function linkToMarkdown(element, context) {
    const href = absolutizeUrl(element.getAttribute("href"));
    const text = inlineChildrenToMarkdown(element, context) || href;

    if (!href) {
      return text;
    }

    if (text === href) {
      return href;
    }

    return `[${escapeMarkdownLinkText(text)}](${href})`;
  }

  function imageToMarkdown(element, context) {
    const src = absolutizeUrl(getImageUrl(element));
    if (!src) {
      return "";
    }

    const comparableUrl = normalizeComparableUrl(src);
    if (context.seenImageUrls.has(comparableUrl)) {
      return "";
    }

    context.seenImageUrls.add(comparableUrl);
    const alt = cleanText(element.getAttribute("alt")) || "Image";
    return `![${escapeMarkdownLinkText(alt)}](${src})`;
  }

  function figureMarkdown(element, context, options) {
    const result = blockChildResults(element, context, options);
    return { text: result.text, stop: result.stop };
  }

  function quoteMarkdown(element, context, options) {
    const result = blockChildResults(element, context, options);
    const text = result.text || inlineChildrenToMarkdown(element, context);
    const quoted = text
      .split("\n")
      .map((line) => (line ? `> ${line}` : ">"))
      .join("\n");
    return quoted;
  }

  function listMarkdown(element, context, options) {
    const ordered = element.tagName === "OL";
    const items = Array.from(element.children).filter((child) => child.tagName === "LI");
    return items.map((item, index) => {
      const marker = ordered ? `${index + 1}.` : "-";
      return listItemMarkdown(item, context, { ...options, listDepth: options.listDepth + 1 }, marker);
    }).filter(Boolean).join("\n");
  }

  function listItemMarkdown(element, context, options, marker) {
    const childChunks = [];
    const nestedLists = [];

    for (const child of element.childNodes) {
      if (child.nodeType === Node.ELEMENT_NODE && (child.tagName === "UL" || child.tagName === "OL")) {
        nestedLists.push(nodeToMarkdown(child, context, options).text);
        continue;
      }

      const result = nodeToMarkdown(child, context, { ...options, inline: !isBlockNode(child) });
      if (result.text) {
        childChunks.push(result.text);
      }
    }

    const indent = "  ".repeat(Math.max(options.listDepth - 1, 0));
    const body = normalizeMarkdown(childChunks.join("\n\n")).replace(/\n/g, `\n${indent}  `);
    const nested = nestedLists.filter(Boolean).map((text) => {
      return text.split("\n").map((line) => `${indent}  ${line}`).join("\n");
    });
    return [`${indent}${marker} ${body}`].concat(nested).filter(Boolean).join("\n");
  }

  function tableMarkdown(element) {
    const rows = Array.from(element.querySelectorAll("tr")).map((row) => {
      return Array.from(row.children).map((cell) => cleanText(cell.textContent).replace(/\|/g, "\\|"));
    }).filter((cells) => cells.length);

    if (!rows.length) {
      return "";
    }

    const columnCount = Math.max(...rows.map((row) => row.length));
    const normalizedRows = rows.map((row) => {
      const copy = row.slice();
      while (copy.length < columnCount) {
        copy.push("");
      }
      return copy;
    });
    const header = normalizedRows[0];
    const separator = Array.from({ length: columnCount }, () => "---");
    const bodyRows = normalizedRows.slice(1);
    return [header, separator, ...bodyRows].map((row) => `| ${row.join(" | ")} |`).join("\n");
  }

  function wrapInline(element, context, wrapper) {
    const text = inlineChildrenToMarkdown(element, context);
    return text ? `${wrapper}${text}${wrapper}` : "";
  }

  function fencedCode(element) {
    const code = element.textContent.replace(/^\n+|\n+$/g, "");
    const fence = code.includes("```") ? "````" : "```";
    return `${fence}\n${code}\n${fence}`;
  }

  function inlineCode(text) {
    if (!text) {
      return "";
    }
    const tickCount = Math.max(1, ...Array.from(text.matchAll(/`+/g)).map((match) => match[0].length + 1));
    const ticks = "`".repeat(tickCount);
    return `${ticks}${text}${ticks}`;
  }

  function getImageUrl(image) {
    return (
      image.currentSrc ||
      image.getAttribute("src") ||
      image.getAttribute("data-src") ||
      image.getAttribute("data-original") ||
      srcFromSet(image.getAttribute("srcset")) ||
      srcFromSet(image.getAttribute("data-srcset")) ||
      ""
    );
  }

  function srcFromSet(srcset) {
    if (!srcset) {
      return "";
    }

    const candidates = srcset.split(",").map((item) => item.trim().split(/\s+/)[0]).filter(Boolean);
    return candidates[candidates.length - 1] || "";
  }

  function absolutizeUrl(value) {
    if (!value) {
      return "";
    }

    try {
      return new URL(value, location.href).href;
    } catch {
      return value;
    }
  }

  function normalizeComparableUrl(value) {
    try {
      const url = new URL(value, location.href);
      url.search = "";
      url.hash = "";
      return url.href;
    } catch {
      return value;
    }
  }

  function isBlockNode(node) {
    return node.nodeType === Node.ELEMENT_NODE && BLOCK_TAGS.has(node.tagName);
  }

  function visibleTextLength(element) {
    return cleanText(element?.textContent || "").length;
  }

  function cleanText(value) {
    return String(value || "").replace(/\s+/g, " ").trim();
  }

  function cleanInlineText(value) {
    return String(value || "")
      .replace(/\u00a0/g, " ")
      .replace(/[ \t\r\f\v]+/g, " ")
      .replace(/ *\n+ */g, "\n")
      .trim();
  }

  function escapeMarkdownLinkText(text) {
    return String(text).replace(/([\\[\]])/g, "\\$1");
  }

  function normalizeMarkdown(value) {
    return String(value || "")
      .replace(/[ \t]+\n/g, "\n")
      .replace(/\n{3,}/g, "\n\n")
      .trim();
  }

  function watchUrlChanges() {
    window.setInterval(() => {
      if (location.href !== currentUrl) {
        currentUrl = location.href;
        ensureButton();
      }
    }, 500);

    const observer = new MutationObserver(() => ensureButton());
    observer.observe(document.documentElement, { childList: true, subtree: true });
  }

  ensureButton();
  watchUrlChanges();
})();

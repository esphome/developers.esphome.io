from mkdocs.structure.toc import AnchorLink


def on_page_content(html, page, config, files):

    if not page.toc or not page.toc.items or not page.meta.get("comments"):
        return

    page.toc.items[0].children.append(AnchorLink("Comments", "comments", 2))

---
title: "Typography - for markdown pages"
date: 2018-03-18T12:13:38+05:30
description: List of all possibilities of Markdown
weight: 4
kind: page
LinkTitle: "Typography"

menu:
  main:
    parent: guide

tags: typography
---
# Heading 1
## Heading 2
### Heading 3
#### Heading 4
##### Heading 5
###### Heading 6

## Typography

 This is [an example](http://example.com/ "Title") inline link.
 **This is bold** and *italic*. While this is `code block()` and following is a `pre` tag

	print 'this is pre tag'

## Following is the syntax highlighted code block

``` go
func getCookie(name string, r interface{}) (*http.Cookie, error) {
	rd := r.(*http.Request)
	cookie, err := rd.Cookie(name)
	if err != nil {
		return nil, err
	}
	return cookie, nil
}
```

``` yaml
title: "Typography - Test for features"
date: 2018-03-18T12:13:38+05:30
description: List of all possibilities of Markdown
menu:
  main:
    parent: guide
    weight: 4

tags: typography
```

## blockquotes
This is blockquote, Will make it *better now*

> 'I want to do with you what spring does with the cherry trees.' <cite>cited ~Pablo Neruda</cite>*


> Et harum quidem *rerum facilis* est et expeditasi distinctio. Nam libero tempore, cum soluta nobis est eligendi optio cumque nihilse impedit

## Unordered list

*   Red
*   Green
*   Blue

Ordered list

1.	Red
2.  Green
3.  Blue

```goat
      .               .                .               .--- 1          .-- 1     / 1
     / \              |                |           .---+            .-+         +
    /   \         .---+---.         .--+--.        |   '--- 2      |   '-- 2   / \ 2
   +     +        |       |        |       |    ---+            ---+          +
  / \   / \     .-+-.   .-+-.     .+.     .+.      |   .--- 3      |   .-- 3   \ / 3
 /   \ /   \    |   |   |   |    |   |   |   |     '---+            '-+         +
 1   2 3   4    1   2   3   4    1   2   3   4         '--- 4          '-- 4     \ 4

```

``` reStructuredText
        .. _my-reference-label:

        Section to cross-reference
        --------------------------

        See :ref:`my-reference-label`, also see :doc:`/components/switch/gpio`.
        :doc:`Using custom text </components/switch/gpio>`.

```

~~~

// Markdown extra adds un-indented code blocks too

if (this_is_more_code == true && !indented) {
    // tild wrapped code blocks, also not indented
}

~~~

Text with
two trailing spaces
(on the right)
can be used
for things like poems

### Horizontal rules

* * *

* * *

* * *

<div class="custom-class" markdown="1">
This is a div wrapping some Markdown plus.  Without the DIV attribute, it ignores the
block.
</div>

## Markdown plus tables

| Header | Header | Right |
| ------ | ------ | ----: |
| Cell   | Cell   |   $10 |
| Cell   | Cell   |   $20 |

-   Outer pipes on tables are optional
-   Colon used for alignment (right versus left)

## Markdown plus definition lists

Bottled water
: $ 1.25
: $ 1.55 (Large)

Milk
Pop
: $ 1.75

-   Multiple definitions and terms are possible
-   Definitions can include multiple paragraphs too

\*[ABBR]&#x3A; Markdown plus abbreviations (produces an <abbr> tag)


Table (Source: [为什么有些汉字在日语中会读成两拍](https://risehere.net/posts/checked-tone-in-japanese/))

|    | 汉语普通话         | 粤语      | 日语        |
| -- | ------------- | ------- | --------- |
| 写作 | 贝克汉姆          | 碧咸      | ベッカム      |
| 读作 | bei ke han mu | bik ham | Be kka mu |

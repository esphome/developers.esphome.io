---
title: Clang requerements
description: The following overview give's a details overview what the CTidy requerements are.

kind: page
---

## Full list of current clang checks

We use the congig from [github](https://google.github.io/styleguide/cppguide.html).
Above that we have use a list of configuration settings listed below.

??? note "Configuration List."
    ```
    Language:        Cpp
    AccessModifierOffset: -1
    AlignAfterOpenBracket: Align
    AlignConsecutiveAssignments: false
    AlignConsecutiveDeclarations: false
    AlignEscapedNewlines: DontAlign
    AlignOperands:   true
    AlignTrailingComments: true
    AllowAllParametersOfDeclarationOnNextLine: true
    AllowShortBlocksOnASingleLine: false
    AllowShortCaseLabelsOnASingleLine: false
    AllowShortFunctionsOnASingleLine: All
    AllowShortIfStatementsOnASingleLine: false
    AllowShortLoopsOnASingleLine: false
    AlwaysBreakAfterReturnType: None
    AlwaysBreakBeforeMultilineStrings: false
    AlwaysBreakTemplateDeclarations: MultiLine
    BinPackArguments: true
    BinPackParameters: true
    BraceWrapping:
      AfterClass:      false
      AfterControlStatement: false
      AfterEnum:       false
      AfterFunction:   false
      AfterNamespace:  false
      AfterObjCDeclaration: false
      AfterStruct:     false
      AfterUnion:      false
      AfterExternBlock: false
      BeforeCatch:     false
      BeforeElse:      false
      IndentBraces:    false
      SplitEmptyFunction: true
      SplitEmptyRecord: true
      SplitEmptyNamespace: true
    BreakBeforeBinaryOperators: None
    BreakBeforeBraces: Attach
    BreakBeforeInheritanceComma: false
    BreakInheritanceList: BeforeColon
    BreakBeforeTernaryOperators: true
    BreakConstructorInitializersBeforeComma: false
    BreakConstructorInitializers: BeforeColon
    BreakAfterJavaFieldAnnotations: false
    BreakStringLiterals: true
    ColumnLimit:     120
    CommentPragmas:  '^ IWYU pragma:'
    CompactNamespaces: false
    ConstructorInitializerAllOnOneLineOrOnePerLine: true
    ConstructorInitializerIndentWidth: 4
    ContinuationIndentWidth: 4
    Cpp11BracedListStyle: true
    DerivePointerAlignment: false
    DisableFormat:   false
    ExperimentalAutoDetectBinPacking: false
    FixNamespaceComments: true
    ForEachMacros:

    -   foreach
    -   Q_FOREACH
    -   BOOST_FOREACH
        IncludeBlocks:   Preserve
        IncludeCategories:
    -   Regex:           '^&lt;ext/.\*.h>'
        Priority:        2
    -   Regex:           '^&lt;.\*.h>'
        Priority:        1
    -   Regex:           '^&lt;.\*'
        Priority:        2
    -   Regex:           '.\*'
            Priority:        3
        IncludeIsMainRegex: '([-\_](test|unittest))?$'
        IndentCaseLabels: true
        IndentPPDirectives: None
        IndentWidth:     2
        IndentWrappedFunctionNames: false
        KeepEmptyLinesAtTheStartOfBlocks: false
        MacroBlockBegin: ''
        MacroBlockEnd:   ''
        MaxEmptyLinesToKeep: 1
        NamespaceIndentation: None
        PenaltyBreakAssignment: 2
        PenaltyBreakBeforeFirstCallParameter: 1
        PenaltyBreakComment: 300
        PenaltyBreakFirstLessLess: 120
        PenaltyBreakString: 1000
        PenaltyBreakTemplateDeclaration: 10
        PenaltyExcessCharacter: 1000000
        PenaltyReturnTypeOnItsOwnLine: 2000
        PointerAlignment: Right
        RawStringFormats:
    -   Language:        Cpp
        Delimiters:
        -   cc
        -   CC
        -   cpp
        -   Cpp
        -   CPP
        -   'c++'
        -   'C++'
            CanonicalDelimiter: ''
            BasedOnStyle:    google
    -   Language:        TextProto
            Delimiters:
              - pb
              - PB
              - proto
              - PROTO
            EnclosingFunctions:
              - EqualsProto
              - EquivToProto
              - PARSE_PARTIAL_TEXT_PROTO
              - PARSE_TEST_PROTO
              - PARSE_TEXT_PROTO
              - ParseTextOrDie
              - ParseTextProtoOrDie
            CanonicalDelimiter: ''
            BasedOnStyle:    google
        ReflowComments:  true
        SortIncludes:    false
        SortUsingDeclarations: false
        SpaceAfterCStyleCast: true
        SpaceAfterTemplateKeyword: false
        SpaceBeforeAssignmentOperators: true
        SpaceBeforeCpp11BracedList: false
        SpaceBeforeCtorInitializerColon: true
        SpaceBeforeInheritanceColon: true
        SpaceBeforeParens: ControlStatements
        SpaceBeforeRangeBasedForLoopColon: true
        SpaceInEmptyParentheses: false
        SpacesBeforeTrailingComments: 2
        SpacesInAngles:  false
        SpacesInContainerLiterals: false
        SpacesInCStyleCastParentheses: false
        SpacesInParentheses: false
        SpacesInSquareBrackets: false
        Standard:        Auto
        TabWidth:        2
        UseTab:          Never
    ```

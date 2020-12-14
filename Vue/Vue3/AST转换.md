Vue3.x编译的第二步是将构建好的AST进行`transform`，它的目的就在于更好的语义化，为了生成代码做准备。

```javascript
function transform(root, options) {
  // 创建 transform 上下文
  const context = createTransformContext(root, options)
  // 遍历 AST 节点
  traverseNode(root, context)
  if (options.hoistStatic) {
    // 静态提升
    hoistStatic(root, context)
  }
  if (!options.ssr) {
    // 创建根代码生成节点
    createRootCodegen(root, context)
  }
  // finalize meta information
  root.helpers = [...context.helpers]
  root.components = [...context.components]
  root.directives = [...context.directives]
  root.imports = [...context.imports]
  root.hoists = context.hoists
  root.temps = context.temps
  root.cached = context.cached
}
```

`transform`过程很清晰，总共4步：**创建上下文**，**遍历AST进行转换**，**静态提升**，**创建根节点的代码生成节点**。

### 创建上下文

```javascript
function createTransformContext(
  root,
  {
    prefixIdentifiers = false,
    hoistStatic = false,
    cacheHandlers = false,
    nodeTransforms = [],
    directiveTransforms = {},
    transformHoist = null,
    isBuiltInComponent = NOOP,
    isCustomElement = NOOP,
    expressionPlugins = [],
    scopeId = null,
    ssr = false,
    ssrCssVars = ``,
    bindingMetadata = {},
    onError = defaultOnError,
  }
) {
  const context = {
    // options
    prefixIdentifiers,
    hoistStatic,
    cacheHandlers,
    // 节点转换函数
    nodeTransforms,
   	// 指令转换函数
    directiveTransforms,
    transformHoist,
    isBuiltInComponent,
    isCustomElement,
    expressionPlugins,
    scopeId,
    ssr,
    ssrCssVars,
    bindingMetadata,
    onError,
    // state
    // AST
    root,
    helpers: new Set(),
    components: new Set(),
    directives: new Set(),
    hoists: [],
    imports: new Set(),
    temps: 0,
    cached: 0,
    identifiers: Object.create(null),
    scopes: {
      vFor: 0,
      vSlot: 0,
      vPre: 0,
      vOnce: 0,
    },
    parent: null,
    currentNode: root,
    childIndex: 0,
    // methods
    helper(name) {
      context.helpers.add(name)
      return name
    },
    helperString(name) {
      return `_${helperNameMap[context.helper(name)]}`
    },
    replaceNode(node) {
      // ...
    },
    removeNode(node) {
      // ...
    },
    onNodeRemoved: () => {},
    addIdentifiers(exp) {},
    removeIdentifiers(exp) {},
    hoist(exp) {
      // ...
    },
    cache(exp, isVNode = false) {
      return createCacheExpression(++context.cached, exp, isVNode)
    },
  }
  return context
}
```

比较重要的选项已经标注在代码上。

### 遍历AST

```javascript
function traverseNode(node, context) {
  context.currentNode = node
  // apply transform plugins
  const { nodeTransforms } = context
  const exitFns = []
  for (let i = 0; i < nodeTransforms.length; i++) {
    // 执行转换函数
    const onExit = nodeTransforms[i](node, context)
    if (onExit) {
      if (isArray(onExit)) {
        exitFns.push(...onExit)
      } else {
        exitFns.push(onExit)
      }
    }
    if (!context.currentNode) {
      // node was removed
      return
    } else {
      // node may have been replaced
      node = context.currentNode
    }
  }
  switch (node.type) {
    case 3 /* COMMENT */:
      if (!context.ssr) {
        // inject import for the Comment symbol, which is needed for creating
        // comment nodes with `createVNode`
        context.helper(CREATE_COMMENT)
      }
      break
    case 5 /* INTERPOLATION */:
      // no need to traverse, but we need to inject toString helper
      if (!context.ssr) {
        context.helper(TO_DISPLAY_STRING)
      }
      break
    // for container types, further traverse downwards
    case 9 /* IF */:
      for (let i = 0; i < node.branches.length; i++) {
        traverseNode(node.branches[i], context)
      }
      break
    case 10 /* IF_BRANCH */:
    case 11 /* FOR */:
    case 1 /* ELEMENT */:
    case 0 /* ROOT */:
      traverseChildren(node, context)
      break
  }
  // exit transforms
  context.currentNode = node
  let i = exitFns.length
  // 执行退出函数
  while (i--) {
    exitFns[i]()
  }
}
```

遍历AST，就是将AST上所有的节点递归遍历一遍，针对每个节点执行所有的转换函数，有一些转换函数会返回退出函数，在处理完子节点后会执行这些退出函数。

转换函数如下：

```javascript
function getBaseTransformPreset(prefixIdentifiers) {
  return [
    [
      // 节点转换函数
      transformOnce,
      transformIf,
      transformFor,
      ...[transformExpression],
      transformSlotOutlet,
      transformElement,
      trackSlotScopes,
      transformText,
    ],
    {
      // 指令转换函数
      on: transformOn,
      bind: transformBind,
      model: transformModel,
    },
  ]
}
```

#### 文本节点转换函数

```javascript
// 文本节点转换函数
const transformText = (node, context) => {
  if (
    node.type === 0 /* ROOT */ ||
    node.type === 1 /* ELEMENT */ ||
    node.type === 11 /* FOR */ ||
    node.type === 10 /* IF_BRANCH */
  ) {
    // perform the transform on node exit so that all expressions have already
    // been processed.
    return () => {
      const children = node.children
      let currentContainer = undefined
      let hasText = false
      // 合并相邻的文本插值节点
      for (let i = 0; i < children.length; i++) {
        const child = children[i]
        if (isText(child)) {
          hasText = true
          for (let j = i + 1; j < children.length; j++) {
            const next = children[j]
            if (isText(next)) {
              if (!currentContainer) {
                currentContainer = children[i] = {
                  type: 8 /* COMPOUND_EXPRESSION */,
                  loc: child.loc,
                  children: [child],
                }
              }
              // merge adjacent text node into current
              currentContainer.children.push(` + `, next)
              children.splice(j, 1)
              j--
            } else {
              currentContainer = undefined
              break
            }
          }
        }
      }
      if (
        !hasText ||
        // if this is a plain element with a single text child, leave it
        // as-is since the runtime has dedicated fast path for this by directly
        // setting textContent of the element.
        // for component root it's always normalized anyway.
        (children.length === 1 &&
          (node.type === 0 /* ROOT */ ||
            (node.type === 1 /* ELEMENT */ &&
              node.tagType === 0))) /* ELEMENT */
      ) {
        return
      }
      // pre-convert text nodes into createTextVNode(text) calls to avoid
      // runtime normalization.
      for (let i = 0; i < children.length; i++) {
        const child = children[i]
        if (isText(child) || child.type === 8 /* COMPOUND_EXPRESSION */) {
          const callArgs = []
          // createTextVNode defaults to single whitespace, so if it is a
          // single space the code could be an empty call to save bytes.
          if (child.type !== 2 /* TEXT */ || child.content !== " ") {
            callArgs.push(child)
          }
          // mark dynamic text with flag so it gets patched inside a block
          if (!context.ssr && child.type !== 2 /* TEXT */) {
            callArgs.push(
              `${1 /* TEXT */} /* ${PatchFlagNames[1 /* TEXT */]} */`
            )
          }
          children[i] = {
            type: 12 /* TEXT_CALL */,
            content: child,
            loc: child.loc,
            codegenNode: createCallExpression(
              context.helper(CREATE_TEXT),
              callArgs
            ),
          }
        }
      }
    }
  }
}
```

文本节点转换函数，只处理根节点，元素节点，`v-for`和`v-if`这4中类型的节点，它会返回退出函数，因为它要保证所有的表达式节点都被处理完才执行转换。

文本节点转换函数的第一个主要逻辑就是，合并相邻的文本节点和插值节点，例如：

```html
<div>hello {{ msg }}</div>
```

上面的模板对应的AST：

```javascript
// div
{
    children: (2) [
        // 被合并
        {
            content: "hello "
            loc: {start: {…}, end: {…}, source: "hello "}
            type: 2 /* TEXT */
    	}, 
        // 被合并
        {
            content: {type: 4, isStatic: false, isConstant: false, content: "msg", loc: {…}}
            loc: {start: {…}, end: {…}, source: "{{ msg }}"}
            type: 5 /* INTERPOLATION */
        }
    ]
    codegenNode: undefined
    isSelfClosing: false
    loc: {start: {…}, end: {…}, source: "<div>hello {{ msg }}</div>"}
    ns: 0
    props: []
    tag: "div"
    tagType: 0
    type: 1
}
```

通过文本节点转换函数处理后，就会变成下面这个样子：

```javascript
// div
{
    children: [
        // 合并后
        {
            children: (3) [
                {
                    content: "hello "
                    loc: {start: {…}, end: {…}, source: "hello "}
                    type: 2
                },
                " + ", 
                {
                    content: {type: 4, isStatic: false, isConstant: false, content: "msg", loc: {…}}
                    loc: {start: {…}, end: {…}, source: "{{ msg }}"}
                    type: 5
                }
            ]
            loc: {start: {…}, end: {…}, source: "hello "}
            type: 8 /* COMPOUND_EXPRESSION */
		}
    ]
    codegenNode: undefined
    isSelfClosing: false
    loc: {start: {…}, end: {…}, source: "<div>hello {{ msg }}</div>"}
    ns: 0
    props: []
    tag: "div"
    tagType: 0
    type: 1
}
```

合并完节点后，如果子节点中只有一个，直接`return`，说明这个节点只可能是`type`为`2,5,8`这三种类型的其中一种，这三种节点都可以直接通过设置元素的`textContent `更新文本。

如果有多个子节点，例如：

```html
<div>hello {{ msg }} <img /> vue</div>
```

文本转换函数会遍历子节点，将`type`为`2,5,8`这三种类型的节点通过`createCallExpression`生成对应的代码生成节点`codegenNode`。

#### v-if 节点转换函数

```javascript
const transformIf = createStructuralDirectiveTransform(
  /^(if|else|else-if)$/,
  (node, dir, context) => {
      return processIf(node, dir, context, (ifNode, branch, isRoot) => {
        return () => {
          // ...
        }
      })
  }
)
```

`transformIf`转换函数是被`createStructuralDirectiveTransform`构造出来的，源码：

```javascript
function createStructuralDirectiveTransform(name, fn) {
  const matches = isString(name) ? (n) => n === name : (n) => name.test(n)
  // 转换函数
  return (node, context) => {
    // 元素节点
    if (node.type === 1 /* ELEMENT */) {
      const { props } = node
      // structural directive transforms are not concerned with slots
      // as they are handled separately in vSlot.ts
      if (node.tagType === 3 /* TEMPLATE */ && props.some(isVSlot)) {
        return
      }
      const exitFns = []
      for (let i = 0; i < props.length; i++) {
        const prop = props[i]
        if (prop.type === 7 /* DIRECTIVE */ && matches(prop.name)) {
          // structural directives are removed to avoid infinite recursion
          // also we remove them *before* applying so that it can further
          // traverse itself in case it moves the node around
          props.splice(i, 1)
          i--
          const onExit = fn(node, prop, context)
          if (onExit) exitFns.push(onExit)
        }
      }
      return exitFns
    }
  }
}
```

`createStructuralDirectiveTransform`接收2个参数，第一个参数就是匹配`if|else|else-if`的正则，第二个参数是构造**转换函数的退出函数**的方法。

`v-if`转换函数逻辑很简单，只有元素节点会被处理，因为只有元素节点可以添加`v-if`这类指令，遍历节点的属性，如果有`v-if`这类指令，就会从属性数组中删除该指令，避免无限递归的情况，这是因为该节点会被再次解析。然后就会去执行传入的函数`fn`，`fn`函数是之前被传入的匿名函数：

```javascript
(node, dir, context) => {
    return processIf(node, dir, context, (ifNode, branch, isRoot) => {
        // 退出函数
        return () => {
            // ...
        }
    })
}
```

函数内部执行了`processIf`，源码：

```javascript
function processIf(node, dir, context, processCodegen) {
  // ...
  // v-if
  if (dir.name === "if") {
    const branch = createIfBranch(node, dir)
    const ifNode = {
      type: 9 /* IF */,
      loc: node.loc,
      branches: [branch],
    }
    context.replaceNode(ifNode)
    if (processCodegen) {
      return processCodegen(ifNode, branch, true)
    }
  } else {
    // v-else-if
    // v-else
  }
}

function createIfBranch(node, dir) {
  return {
    type: 10 /* IF_BRANCH */,
    loc: node.loc,
    // 页面最终渲染分支的依据
    condition: dir.name === "else" ? undefined : dir.exp,
    children:
      node.tagType === 3 /* TEMPLATE */ && !findDir(node, "for")
        ? node.children
        : [node],
    userKey: findProp(node, `key`),
  }
}
```

`processIf`函数是处理`v-if`以及`v-else`和`v-else-if`这3中指令的，带有`v-if`的节点会创建一个分支和`ifNode`，分支中的`children`指向的就是自己，然后分支会被压入`ifNode.banrches`中，`ifNode`会替换父节点中`children`当前解析中的节点（也就是自己），最后执行`processCodegen`返回退出函数。

`v-else-if`和`v-else`相关逻辑：

```javascript
function processIf(node, dir, context, processCodegen) {
  // ...
  // v-if
  if (dir.name === "if") {
    // ...
  } else {
    // locate the adjacent v-if
    const siblings = context.parent.children
    const comments = []
    let i = siblings.indexOf(node)
    // 向前遍历 v-if 节点
    while (i-- >= -1) {
      const sibling = siblings[i]
      if (sibling && sibling.type === 3 /* COMMENT */) {
        context.removeNode(sibling)
        comments.unshift(sibling)
        continue
      }
      if (sibling && sibling.type === 9 /* IF */) {
        // move the node to the if node's branches
        // 移除当前节点
        context.removeNode()
      	// 创建分支
        const branch = createIfBranch(node, dir)
        if (comments.length) {
          branch.children = [...comments, ...branch.children]
        }
        // check if user is forcing same key on different branches
        {
          const key = branch.userKey
          if (key) {
            sibling.branches.forEach(({ userKey }) => {
              if (isSameKey(userKey, key)) {
                context.onError(
                  createCompilerError(
                    28 /* X_V_IF_SAME_KEY */,
                    branch.userKey.loc
                  )
                )
              }
            })
          }
        }
        // 分支push到分支数组中
        sibling.branches.push(branch)
        const onExit =
          processCodegen && processCodegen(sibling, branch, false)
        // since the branch was removed, it will not be traversed.
        // make sure to traverse here.
        // 由于删除了当前节点，那么需要遍历当前节点的子节点
        traverseNode(branch, context)
        // call on exit
        if (onExit) onExit()
        // make sure to reset currentNode after traversal to indicate this
        // node has been removed.
        context.currentNode = null
      } else {
        context.onError(
          createCompilerError(29 /* X_V_ELSE_NO_ADJACENT_IF */, node.loc)
        )
      }
      break
    }
  }
}
```

遍历寻找前面的`ifNode`，然后将自身从父节点的`children`中删除，并创建分支，压入到`ifNode.branches`中，在遍历当前节点的子节点，最后执行退出函数，源码：

```javascript
return () => {
  if (isRoot) {
    // v-if
    ifNode.codegenNode = createCodegenNodeForBranch(
      branch,
      key,
      context
    )
  } else {
    // v-else
    // v-else-if 
  }
}
```

`v-if`会通过`createCodegenNodeForBranch`创建`ifNode`的代码生成节点`codegenNode`，源码：

```javascript
function createCodegenNodeForBranch(branch, keyIndex, context) {
  if (branch.condition) {
    // v-if
    // v-else-if
    return createConditionalExpression(
      branch.condition,
      createChildrenCodegenNode(branch, keyIndex, context),
      // make sure to pass in asBlock: true so that the comment node call
      // closes the current block.
      // alternate
      createCallExpression(context.helper(CREATE_COMMENT), ['"v-if"', "true"])
    )
  } else {
     // v-else
    return createChildrenCodegenNode(branch, keyIndex, context)
  }
}
```

`v-if`和`v-else-if`通过`createConditionalExpression`创建`codegenNode`，源码：

```javascript
function createConditionalExpression(
  test,
  consequent,
  alternate,
  newline = true
) {
  return {
    type: 19 /* JS_CONDITIONAL_EXPRESSION */,
    test,
    consequent,
    // 候补
    alternate,
    newline,
    loc: locStub,
  }
}
```

`consequent`代表`v-if`的表达式为`true`时的`codegenNode`，它由`createChildrenCodegenNode`生成，`alternate`代表`v-if`的表达式为`false`时的`codegenNode`，它由`createCallExpression`生成。

```javascript
function createChildrenCodegenNode(branch, keyIndex, context) {
  const { helper } = context
  const keyProperty = createObjectProperty(
    `key`,
    createSimpleExpression(`${keyIndex}`, false, locStub, true)
  )
  const { children } = branch
  const firstChild = children[0]
  const needFragmentWrapper =
    children.length !== 1 || firstChild.type !== 1 /* ELEMENT */
  if (needFragmentWrapper) {
    if (children.length === 1 && firstChild.type === 11 /* FOR */) {
      // optimize away nested fragments when child is a ForNode
      const vnodeCall = firstChild.codegenNode
      injectProp(vnodeCall, keyProperty, context)
      return vnodeCall
    } else {
      return createVNodeCall(
        context,
        helper(FRAGMENT),
        createObjectExpression([keyProperty]),
        children,
        `${64 /* STABLE_FRAGMENT */} /* ${
          PatchFlagNames[64 /* STABLE_FRAGMENT */]
        } */`,
        undefined,
        undefined,
        true,
        false,
        branch.loc
      )
    }
  } else {
    const vnodeCall = firstChild.codegenNode
    // Change createVNode to createBlock.
    if (vnodeCall.type === 13 /* VNODE_CALL */) {
      vnodeCall.isBlock = true
      helper(OPEN_BLOCK)
      helper(CREATE_BLOCK)
    }
    // inject branch key
    injectProp(vnodeCall, keyProperty, context)
    return vnodeCall
  }
}
```

`createChildrenCodegenNode`的主要作用是，把它的子节点设置为`block`节点，并反回`codegenNode`。

```javascript
function createCallExpression(callee, args = [], loc = locStub) {
  return {
    type: 14 /* JS_CALL_EXPRESSION */,
    loc,
    callee,
    arguments: args,
  }
}
```

`createCallExpression`直接反回`codegenNode`描述对象。

`callee`是传入的`context.helper(CREATE_COMMENT)`，如果分支中只有1个主分支，且分支的`condition`为`false`，那么页面就会渲染1个注释节点`<!-- v-if -->`，就是通过这个`CREATE_COMMENT`辅助函数生成的。

退出函数`v-else-if`和`v-else`的逻辑：

```javascript
return () => {
  if (isRoot) {
    // v-if
  } else {
    // attach this branch's codegen node to the v-if root.
    // v-else
    // v-else-if
    let parentCondition = ifNode.codegenNode
    while (
      parentCondition.alternate.type ===
      19 /* JS_CONDITIONAL_EXPRESSION */
    ) {
      // 多层v-else-if，不断向下找
      parentCondition = parentCondition.alternate
    }
    // 候补
    parentCondition.alternate = createCodegenNodeForBranch(
      branch,
      key + ifNode.branches.length - 1,
      context
    )
  }
}
```

`v-else-if`和`v-else`首先会获取`ifNode.codegenNode`，然后将生成的`codegenNode`赋值给`ifNode.codegenNode.alternate `。

举个例子：

```html
<div v-if="flag">100</div>
<div v-else-if="flag === 1">300</div>
<div v-else>200</div>
```

转换后的AST：

```javascript
{
	cached: 0
    children: [
        // ifNode
        {
        	branches: (2) [
                {
                    children: [{…}]
                    condition: {
                        type: 4, 
                        content: "flag", 
                        isStatic: false, 
                        isConstant: false, 
                        loc: {…}
                    }
                    loc: {start: {…}, end: {…}, source: "<div v-if="flag">100</div>"}
                    type: 10 /* IF_BRANCH */
                    userKey: undefined
                }, 
                {
					children: [{…}]
                    condition: {
                        type: 4
                        content: "flag === 1", 
                        isStatic: false
                        isConstant: false
                        loc: {…}
                    }
                    loc: {start: {…}, end: {…}, source: "<div v-else-if="flag === 1">300</div>"}
                    type: 10 /* IF_BRANCH */
                    userKey: undefined
                }，
                {
                    children: [{…}]
                    condition: undefined
                    loc: {start: {…}, end: {…}, source: "<div v-else>200</div>"}
                    type: 10 /* IF_BRANCH */
                    userKey: undefined
                }
            ]
            codegenNode: {
                // 后补
                alternate: {
                    // v-else
                  	calternate: {
                        children: {type: 2, content: "200", loc: {…}}
                        directives: undefined
                        disableTracking: false
                        dynamicProps: undefined
                        isBlock: true
                        loc: {start: {…}, end: {…}, source: "<div v-else>200</div>"}
                        patchFlag: undefined
                        props: {...}
                        tag: ""div""
                        type: 13 /* VNODE_CALL */
                    }
                    // v-else-if
                    consequent: {
                        children: {type: 2, content: "300", loc: {…}}
                        directives: undefined
                        disableTracking: false
                        dynamicProps: undefined
                        isBlock: true
                        loc: {start: {…}, end: {…}, source: "<div v-else-if="flag === 1">300</div>"}
                        patchFlag: undefined
                        props: {...}
                        tag: ""div""
                        type: 13 /* VNODE_CALL */
                    }
                    loc: {source: "", start: {…}, end: {…}}
                    newline: true
                    test: {type: 4, content: "flag === 1", isStatic: false, isConstant: false, loc: {…}}
                    type: 19 /* JS_CONDITIONAL_EXPRESSION */
                },
                // v-if
                consequent: {
                    children: {type: 2, content: "100", loc: {…}}
                    directives: undefined
                    disableTracking: false
                    dynamicProps: undefined
                    isBlock: true
                    loc: {start: {…}, end: {…}, source: "<div v-if="flag">100</div>"}
                    patchFlag: undefined
                    props: {type: 4, loc: {…}, isConstant: true, content: "_hoisted_1", isStatic: false, …}
                    tag: ""div""
                    type: 13 /* VNODE_CALL */
                }
                loc: {source: "", start: {…}, end: {…}}
                newline: true
                test: {type: 4, content: "flag", isStatic: false, isConstant: false, loc: {…}}
                type: 19 /* JS_CONDITIONAL_EXPRESSION */
            }
            loc: {start: {…}, end: {…}, source: "<div v-if="flag">100</div>"}
            type: 9 /* IF */
    	}
    ]
    // ...
    type: 0 /* ROOT */
}
```

生成代码：

```javascript
const _Vue = Vue
const { createVNode: _createVNode, createCommentVNode: _createCommentVNode } = _Vue

const _hoisted_1 = { key: 0 }
const _hoisted_2 = { key: 1 }
const _hoisted_3 = { key: 2 }

return function render(_ctx, _cache) {
  with (_ctx) {
    const { createVNode: _createVNode, openBlock: _openBlock, createBlock: _createBlock, createCommentVNode: _createCommentVNode } = _Vue

    return flag
      ? (_openBlock(), _createBlock("div", _hoisted_1, "100"))
      : (flag === 1)
        ? (_openBlock(), _createBlock("div", _hoisted_2, "300"))
        : (_openBlock(), _createBlock("div", _hoisted_3, "200"))
  }
}
```

#### v-for 节点转换函数

`v-for`节点的转换函数也是通过`createStructuralDirectiveTransform`构造出来的：

```javascript
const transformFor = createStructuralDirectiveTransform(
  "for",
  (node, dir, context) => {
    const { helper } = context
    return processFor(node, dir, context, (forNode) => {
      // ...
      return () => {
        // ...
      }
    })
  }
)


function createStructuralDirectiveTransform(name, fn) {
  const matches = isString(name) ? (n) => n === name : (n) => name.test(n)
  // 转换函数
  return (node, context) => {
    if (node.type === 1 /* ELEMENT */) {
      const { props } = node
      // structural directive transforms are not concerned with slots
      // as they are handled separately in vSlot.ts
      if (node.tagType === 3 /* TEMPLATE */ && props.some(isVSlot)) {
        return
      }
      const exitFns = []
      for (let i = 0; i < props.length; i++) {
        const prop = props[i]
        if (prop.type === 7 /* DIRECTIVE */ && matches(prop.name)) {
          // structural directives are removed to avoid infinite recursion
          // also we remove them *before* applying so that it can further
          // traverse itself in case it moves the node around
          props.splice(i, 1)
          i--
          const onExit = fn(node, prop, context)
          if (onExit) exitFns.push(onExit)
        }
      }
      return exitFns
    }
  }
}
```

和`v-if`的逻辑一样，遍历属性中的`v-for`并将其删除，执行传入的匿名函数。

```javascript
(node, dir, context) => {
    const { helper } = context
    return processFor(node, dir, context, (forNode) => {
        // ...
        return () => {
            // ...
        }
    })
}
```

内部执行了`processFor`函数，源码：

```javascript
function processFor(node, dir, context, processCodegen) {
  if (!dir.exp) {
    context.onError(
      createCompilerError(30 /* X_V_FOR_NO_EXPRESSION */, dir.loc)
    )
    return
  }
  // 解析v-for的表达式
  const parseResult = parseForExpression(
    // can only be simple expression because vFor transform is applied
    // before expression transform.
    dir.exp,
    context
  )
  if (!parseResult) {
    context.onError(
      createCompilerError(31 /* X_V_FOR_MALFORMED_EXPRESSION */, dir.loc)
    )
    return
  }
  const { addIdentifiers, removeIdentifiers, scopes } = context
  const { source, value, key, index } = parseResult
  const forNode = {
    type: 11 /* FOR */,
    loc: dir.loc,
    source,
    valueAlias: value,
    keyAlias: key,
    objectIndexAlias: index,
    parseResult,
    children: isTemplateNode(node) ? node.children : [node],
  }
  context.replaceNode(forNode)
  // bookkeeping
  scopes.vFor++
  const onExit = processCodegen && processCodegen(forNode)
  return () => {
    scopes.vFor--
    if (onExit) onExit()
  }
}
```

解析`v-for`指令，先解析其表达式，在创建`forNode`，用它替换自身在父节点中`chidlren`的位置，执行`processCodegen`返回退出函数，`processCodegen`是传入的匿名函数，源码：

```javascript
(forNode) => {
    // create the loop render function expression now, and add the
    // iterator on exit after all children have been traversed
    const renderExp = createCallExpression(helper(RENDER_LIST), [
      forNode.source,
    ])
    const keyProp = findProp(node, `key`)
    const keyProperty = keyProp
      ? createObjectProperty(
          `key`,
          keyProp.type === 6 /* ATTRIBUTE */
            ? createSimpleExpression(keyProp.value.content, true)
            : keyProp.exp
        )
      : null
    const isStableFragment =
      forNode.source.type === 4 /* SIMPLE_EXPRESSION */ &&
      forNode.source.isConstant
    const fragmentFlag = isStableFragment
      ? 64 /* STABLE_FRAGMENT */
      : keyProp
      ? 128 /* KEYED_FRAGMENT */
      : 256 /* UNKEYED_FRAGMENT */
    forNode.codegenNode = createVNodeCall(
      context,
      helper(FRAGMENT),
      undefined,
      renderExp,
      `${fragmentFlag} /* ${PatchFlagNames[fragmentFlag]} */`,
      undefined,
      undefined,
      true /* isBlock */,
      !isStableFragment /* disableTracking */,
      node.loc
    )
    
    // 退出函数
    return () => {
    	// ...
    }
})
```

创建循环渲染函数表达式`renderExp`，它的作用是为了渲染子节点列表，然后为`forNode`生成`codegenNode`，可以看到`createVNodeCall`第二个参数是`helper(FRAGMENT)`，`Vue3.x`会将`v-for`外面包一层`fragment`，最后返回退出函数：

```javascript
return () => {
  // finish the codegen now that all children have been traversed
  let childBlock
  const isTemplate = isTemplateNode(node)
  const { children } = forNode
  // check <template v-for> key placement
  if (isTemplate) {
    node.children.some((c) => {
      if (c.type === 1 /* ELEMENT */) {
        const key = findProp(c, "key")
        if (key) {
          context.onError(
            createCompilerError(
              32 /* X_V_FOR_TEMPLATE_KEY_PLACEMENT */,
              key.loc
            )
          )
          return true
        }
      }
    })
  }
  const needFragmentWrapper =
    children.length !== 1 || children[0].type !== 1 /* ELEMENT */
  const slotOutlet = isSlotOutlet(node)
    ? node
    : isTemplate &&
      node.children.length === 1 &&
      isSlotOutlet(node.children[0])
    ? node.children[0] // api-extractor somehow fails to infer this
    : null
  if (slotOutlet) {
    // <slot v-for="..."> or <template v-for="..."><slot/></template>
    childBlock = slotOutlet.codegenNode
    if (isTemplate && keyProperty) {
      // <template v-for="..." :key="..."><slot/></template>
      // we need to inject the key to the renderSlot() call.
      // the props for renderSlot is passed as the 3rd argument.
      injectProp(childBlock, keyProperty, context)
    }
  } else if (needFragmentWrapper) {
    // <template v-for="..."> with text or multi-elements
    // should generate a fragment block for each loop
    childBlock = createVNodeCall(
      context,
      helper(FRAGMENT),
      keyProperty ? createObjectExpression([keyProperty]) : undefined,
      node.children,
      `${64 /* STABLE_FRAGMENT */} /* ${
        PatchFlagNames[64 /* STABLE_FRAGMENT */]
      } */`,
      undefined,
      undefined,
      true
    )
  } else {
    // Normal element v-for. Directly use the child's codegenNode
    // but mark it as a block.
    childBlock = children[0].codegenNode
    if (isTemplate && keyProperty) {
      injectProp(childBlock, keyProperty, context)
    }
    childBlock.isBlock = !isStableFragment
    if (childBlock.isBlock) {
      helper(OPEN_BLOCK)
      helper(CREATE_BLOCK)
    }
  }
  renderExp.arguments.push(
    createFunctionExpression(
      createForLoopParams(forNode.parseResult),
      childBlock,
      true /* force newline */
    )
  )
}
```

`v-for`退出函数的作用，当`forNode`的子节点解析完毕后，将它的`codegenNode`与`createForLoopParams(forNode.parseResult)`通过`createFunctionExpression`生成的函数表达式对象压入到`renderExp.arguments`中，这是为了生成代码做准备。

```javascript
function createFunctionExpression(
  params,
  returns = undefined,
  newline = false,
  isSlot = false,
  loc = locStub
) {
  return {
    type: 18 /* JS_FUNCTION_EXPRESSION */,
    params,
    returns,
    newline,
    isSlot,
    loc,
  }
}
```

从`createFunctionExpression`可以看出，子节点的`codegenNode`就是`returns`，而`createForLoopParams(forNode.parseResult)`是`params`。

举个例子：

```html
<div v-for="item in arr" :key="item">{{item}}</div>
```

转化后的AST：

```javascript
{
    cached: 0
	children: [
        /* forNode */
        {
            children: [{…}]
            codegenNode: {
                children: {
                    arguments: [
                        {type: 4, loc: {…}, isConstant: false, content: "arr", isStatic: false}, 
                        {
                            isSlot: false
                            loc: {source: "", start: {…}, end: {…}}
                            newline: true
                            // params
                            params: [{
                                content: "item"
                                isConstant: false
                                isStatic: false
                                loc: {...}
                                type: 4
                            }]
                            // returns
                            returns: {
                                children: {type: 5, content: {…}, loc: {…}}
                                directives: undefined
                                disableTracking: false
                                dynamicProps: undefined
                                isBlock: true
                                loc: {...}
                                patchFlag: "1 /* TEXT */"
                                props: {type: 15, loc: {…}, properties: Array(1)}
                                tag: ""div""
                                type: 13
                            }
                            type: 18
                        }
                    ]
                    callee: Symbol(renderList)
                    loc: {source: "", start: {…}, end: {…}}
                    type: 14
                }
                directives: undefined
                disableTracking: true
                dynamicProps: undefined
                isBlock: true
                loc: {start: {…}, end: {…}, source: "<div v-for="item in arr" :key="item">{{item}}</div>"}
                patchFlag: "128 /* KEYED_FRAGMENT */"
                props: undefined
                tag: Symbol(Fragment)
                type: 13
            }
            keyAlias: undefined
            loc: {start: {…}, end: {…}, source: "v-for="item in arr""}
            objectIndexAlias: undefined
            parseResult: {source: {…}, value: {…}, key: undefined, index: undefined}
            source: {type: 4, loc: {…}, isConstant: false, content: "arr", isStatic: false}
            type: 11 /* FOR */
            valueAlias: {type: 4, loc: {…}, isConstant: false, content: "item", isStatic: false}
    	}
    ]
    // ...
    type: 0
}
```

生成的代码：

```javascript
const _Vue = Vue

return function render(_ctx, _cache) {
  with (_ctx) {
    const { renderList: _renderList, Fragment: _Fragment, openBlock: _openBlock, createBlock: _createBlock, toDisplayString: _toDisplayString } = _Vue

    return (_openBlock(true), _createBlock(_Fragment, null, _renderList(arr, /* params */(item) => {
      // returns
      return (_openBlock(), _createBlock("div", { key: item }, _toDisplayString(item), 1 /* TEXT */))
    }), 128 /* KEYED_FRAGMENT */))
  }
}
```

#### 元素节点转换函数

```javascript
// 元素节点转换函数
const transformElement = (node, context) => {
  if (
    !(
      (
        node.type === 1 /* ELEMENT */ &&
        (node.tagType === 0 /* ELEMENT */ || node.tagType === 1)
      ) /* COMPONENT */
    )
  ) {
    return
  }
  // perform the work on exit, after all child expressions have been
  // processed and merged.
  return function postTransformElement() {
    const { tag, props } = node
    const isComponent = node.tagType === 1 /* COMPONENT */
    // The goal of the transform is to create a codegenNode implementing the
    // VNodeCall interface.
    const vnodeTag = isComponent
      ? resolveComponentType(node, context)
      : `"${tag}"`
    const isDynamicComponent =
      isObject(vnodeTag) && vnodeTag.callee === RESOLVE_DYNAMIC_COMPONENT
    let vnodeProps
    let vnodeChildren
    let vnodePatchFlag
    let patchFlag = 0
    let vnodeDynamicProps
    let dynamicPropNames
    let vnodeDirectives
    let shouldUseBlock =
      // dynamic component may resolve to plain elements
      isDynamicComponent ||
      vnodeTag === TELEPORT ||
      vnodeTag === SUSPENSE ||
      (!isComponent &&
        // <svg> and <foreignObject> must be forced into blocks so that block
        // updates inside get proper isSVG flag at runtime. (#639, #643)
        // This is technically web-specific, but splitting the logic out of core
        // leads to too much unnecessary complexity.
        (tag === "svg" ||
          tag === "foreignObject" ||
          // #938: elements with dynamic keys should be forced into blocks
          findProp(node, "key", true)))
    // props
    if (props.length > 0) {
      const propsBuildResult = buildProps(node, context)
      vnodeProps = propsBuildResult.props
      patchFlag = propsBuildResult.patchFlag
      dynamicPropNames = propsBuildResult.dynamicPropNames
      const directives = propsBuildResult.directives
      vnodeDirectives =
        directives && directives.length
          ? createArrayExpression(
              directives.map((dir) => buildDirectiveArgs(dir, context))
            )
          : undefined
    }
    // children
    if (node.children.length > 0) {
      if (vnodeTag === KEEP_ALIVE) {
        // Although a built-in component, we compile KeepAlive with raw children
        // instead of slot functions so that it can be used inside Transition
        // or other Transition-wrapping HOCs.
        // To ensure correct updates with block optimizations, we need to:
        // 1. Force keep-alive into a block. This avoids its children being
        //    collected by a parent block.
        shouldUseBlock = true
        // 2. Force keep-alive to always be updated, since it uses raw children.
        patchFlag |= 1024 /* DYNAMIC_SLOTS */
        if (node.children.length > 1) {
          context.onError(
            createCompilerError(44 /* X_KEEP_ALIVE_INVALID_CHILDREN */, {
              start: node.children[0].loc.start,
              end: node.children[node.children.length - 1].loc.end,
              source: "",
            })
          )
        }
      }
      const shouldBuildAsSlots =
        isComponent &&
        // Teleport is not a real component and has dedicated runtime handling
        vnodeTag !== TELEPORT &&
        // explained above.
        vnodeTag !== KEEP_ALIVE
      if (shouldBuildAsSlots) {
        // slot
        const { slots, hasDynamicSlots } = buildSlots(node, context)
        vnodeChildren = slots
        if (hasDynamicSlots) {
          patchFlag |= 1024 /* DYNAMIC_SLOTS */
        }
      } else if (node.children.length === 1 && vnodeTag !== TELEPORT) {
        // 单个子节点
        // teleport
        const child = node.children[0]
        const type = child.type
        // check for dynamic text children
        const hasDynamicTextChild =
          type === 5 /* INTERPOLATION */ ||
          type === 8 /* COMPOUND_EXPRESSION */
        if (hasDynamicTextChild && !getStaticType(child)) {
          patchFlag |= 1 /* TEXT */
        }
        // pass directly if the only child is a text node
        // (plain / interpolation / expression)
        // 插值节点
        // 复合节点
        // 文本节点
        if (hasDynamicTextChild || type === 2 /* TEXT */) {
          vnodeChildren = child
        } else {
          vnodeChildren = node.children
        }
      } else {
        // 多个子节点
        vnodeChildren = node.children
      }
    }
    // patchFlag & dynamicPropNames
    if (patchFlag !== 0) {
      {
        if (patchFlag < 0) {
          // special flags (negative and mutually exclusive)
          vnodePatchFlag = patchFlag + ` /* ${PatchFlagNames[patchFlag]} */`
        } else {
          // bitwise flags
          const flagNames = Object.keys(PatchFlagNames)
            .map(Number)
            .filter((n) => n > 0 && patchFlag & n)
            .map((n) => PatchFlagNames[n])
            .join(`, `)
          vnodePatchFlag = patchFlag + ` /* ${flagNames} */`
        }
      }
      if (dynamicPropNames && dynamicPropNames.length) {
        // :[key]="value"
        vnodeDynamicProps = stringifyDynamicPropNames(dynamicPropNames)
      }
    }
    node.codegenNode = createVNodeCall(
      context,
      vnodeTag,
      vnodeProps,
      vnodeChildren,
      vnodePatchFlag,
      vnodeDynamicProps,
      vnodeDirectives,
      !!shouldUseBlock,
      false /* disableTracking */,
      node.loc
    )
  }
}
```

元素节点转换函数的退出函数，主要做了以下几个工作：

1. 判断节点是否为一个`block`节点，`block`节点是`Vue3.x`新设计的概念，主要作用是在运行时优化更新。
2. 处理节点上的所有属性`props`，并更新标识`patchFlag`，作用于标识节点更新的类型，在组件更新的优化中会用到。
3. 处理子节点`children`。
4. 根据解析属性获得的`patchFlag`和`dynamicPropNames`处理`vnodePatchFlag`和`vnodeDynamicProps`。这个过程，会根据`patchFlag`的值从`PatchFlagNames`过滤出对应的`PatchFlagName`，拼接成注释，在生成后的代码中可以直接看到`patchFlag`数值所代表的具体含义。

### 静态提升

静态提升是`Vue3.x`设计的一个优化策略，作用是将所有的静态节点全部提到`render`之外，这样每次数据更新后，执行`render`的时候，不会再次创建这些静态节点对应的`VNode`，而是直接使用缓存中的`VNode`，这样就会减少计算过程。

而静态提升就是找到这些静态节点，给它们打上标记，在生成代码阶段使用。

```javascript
function hoistStatic(root, context) {
  walk(
    root,
    context,
    new Map(),
    // Root node is unfortunately non-hoistable due to potential parent
    // fallthrough attributes.
    isSingleElementRoot(root, root.children[0])
  )
}


function walk(node, context, resultCache, doNotHoistNode = false) {
  let hasHoistedNode = false
  // Some transforms, e.g. transformAssetUrls from @vue/compiler-sfc, replaces
  // static bindings with expressions. These expressions are guaranteed to be
  // constant so they are still eligible for hoisting, but they are only
  // available at runtime and therefore cannot be evaluated ahead of time.
  // This is only a concern for pre-stringification (via transformHoist by
  // @vue/compiler-dom), but doing it here allows us to perform only one full
  // walk of the AST and allow `stringifyStatic` to stop walking as soon as its
  // stringficiation threshold is met.
  let hasRuntimeConstant = false
  const { children } = node
  for (let i = 0; i < children.length; i++) {
    const child = children[i]
    // only plain elements & text calls are eligible for hoisting.
    if (child.type === 1 /* ELEMENT */ && child.tagType === 0 /* ELEMENT */) {
      let staticType
      if (
        !doNotHoistNode &&
        (staticType = getStaticType(child, resultCache)) > 0
      ) {
        // 普通元素
        if (staticType === 2 /* HAS_RUNTIME_CONSTANT */) {
          hasRuntimeConstant = true
        }
        child.codegenNode.patchFlag = -1 /* HOISTED */ + ` /* HOISTED */`
        child.codegenNode = context.hoist(child.codegenNode)
        hasHoistedNode = true
        continue
      } else {
        // node may contain dynamic children, but its props may be eligible for
        // hoisting.
        // 属性
        const codegenNode = child.codegenNode
        if (codegenNode.type === 13 /* VNODE_CALL */) {
          const flag = getPatchFlag(codegenNode)
          if (
            (!flag ||
              flag === 512 /* NEED_PATCH */ ||
              flag === 1) /* TEXT */ &&
            !hasNonHoistableProps(child)
          ) {
            const props = getNodeProps(child)
            if (props) {
              codegenNode.props = context.hoist(props)
            }
          }
        }
      }
    } else if (child.type === 12 /* TEXT_CALL */) {
      // 文本
      const staticType = getStaticType(child.content, resultCache)
      if (staticType > 0) {
        if (staticType === 2 /* HAS_RUNTIME_CONSTANT */) {
          hasRuntimeConstant = true
        }
        child.codegenNode = context.hoist(child.codegenNode)
        hasHoistedNode = true
      }
    }
    // walk further
    if (child.type === 1 /* ELEMENT */) {
      walk(child, context, resultCache)
    } else if (child.type === 11 /* FOR */) {
      // Do not hoist v-for single child because it has to be a block
      walk(child, context, resultCache, child.children.length === 1)
    } else if (child.type === 9 /* IF */) {
      for (let i = 0; i < child.branches.length; i++) {
        // Do not hoist v-if single child because it has to be a block
        walk(
          child.branches[i],
          context,
          resultCache,
          child.branches[i].children.length === 1
        )
      }
    }
  }
  if (!hasRuntimeConstant && hasHoistedNode && context.transformHoist) {
    context.transformHoist(children, context, node)
  }
}
```

静态提升的节点只能是元素节点，文本节点以及属性节点。

元素节点和文本节点的都会通过`getStaticType`来获取静态类型，如果是元素节点，`getStaticType`会递归调用判断其子节点的静态类型，属性节点则会通过`patchFlag`和`hasNonHoistableProps`来判断它是否动态。

`getStaticType`源码：

```javascript
function getStaticType(node, resultCache = new Map()) {
  switch (node.type) {
    // 元素节点
    case 1 /* ELEMENT */: 
      // slot
      // component
      // template
      if (node.tagType !== 0 /* ELEMENT */) {
        return 0 /* NOT_STATIC */
      }
      const cached = resultCache.get(node)
      if (cached !== undefined) {
        return cached
      }
      const codegenNode = node.codegenNode
      if (codegenNode.type !== 13 /* VNODE_CALL */) {
        return 0 /* NOT_STATIC */
      }
      const flag = getPatchFlag(codegenNode)
      if (!flag && !hasNonHoistableProps(node)) {
        // element self is static. check its children.
        let returnType = 1 /* FULL_STATIC */
        for (let i = 0; i < node.children.length; i++) {
          const childType = getStaticType(node.children[i], resultCache)
          if (childType === 0 /* NOT_STATIC */) {
            resultCache.set(node, 0 /* NOT_STATIC */)
            return 0 /* NOT_STATIC */
          } else if (childType === 2 /* HAS_RUNTIME_CONSTANT */) {
            returnType = 2 /* HAS_RUNTIME_CONSTANT */
          }
        }
        // check if any of the props contain runtime constants
        if (returnType !== 2 /* HAS_RUNTIME_CONSTANT */) {
          for (let i = 0; i < node.props.length; i++) {
            const p = node.props[i]
            if (
              p.type === 7 /* DIRECTIVE */ &&
              p.name === "bind" &&
              p.exp &&
              (p.exp.type === 8 /* COMPOUND_EXPRESSION */ ||
                p.exp.isRuntimeConstant)
            ) {
              returnType = 2 /* HAS_RUNTIME_CONSTANT */
            }
          }
        }
        // only svg/foreignObject could be block here, however if they are
        // stati then they don't need to be blocks since there will be no
        // nested updates.
        if (codegenNode.isBlock) {
          codegenNode.isBlock = false
        }
        resultCache.set(node, returnType)
        return returnType
      } else {
        resultCache.set(node, 0 /* NOT_STATIC */)
        return 0 /* NOT_STATIC */
      }
    case 2 /* TEXT */:
    case 3 /* COMMENT */:
      return 1 /* FULL_STATIC */
    case 9 /* IF */:
    case 11 /* FOR */:
    case 10 /* IF_BRANCH */:
      return 0 /* NOT_STATIC */
    case 5 /* INTERPOLATION */:
    case 12 /* TEXT_CALL */:
      return getStaticType(node.content, resultCache)
    case 4 /* SIMPLE_EXPRESSION */:
      return node.isConstant
        ? node.isRuntimeConstant
          ? 2 /* HAS_RUNTIME_CONSTANT */
          : 1 /* FULL_STATIC */
        : 0 /* NOT_STATIC */
    case 8 /* COMPOUND_EXPRESSION */:
      let returnType = 1 /* FULL_STATIC */
      for (let i = 0; i < node.children.length; i++) {
        const child = node.children[i]
        if (isString(child) || isSymbol(child)) {
          continue
        }
        const childType = getStaticType(child, resultCache)
        if (childType === 0 /* NOT_STATIC */) {
          return 0 /* NOT_STATIC */
        } else if (childType === 2 /* HAS_RUNTIME_CONSTANT */) {
          returnType = 2 /* HAS_RUNTIME_CONSTANT */
        }
      }
      return returnType
    default:
      return 0 /* NOT_STATIC */
  }
}
```

如果满足静态提升的条件，会通过`hoist`创建1个新的代码生成节点：

```javascript
hoist(exp) {
    context.hoists.push(exp)
    const identifier = createSimpleExpression(
        `_hoisted_${context.hoists.length}`,
        false,
        exp.loc,
        true
    )
    identifier.hoisted = exp
    return identifier
 }
```

#### 创建根代码生成节点

```javascript
function createRootCodegen(root, context) {
  const { helper } = context
  const { children } = root
  if (children.length === 1) {
    const child = children[0]
    // if the single child is an element, turn it into a block.
    if (isSingleElementRoot(root, child) && child.codegenNode) {
      // single element root is never hoisted so codegenNode will never be
      // SimpleExpressionNode
      const codegenNode = child.codegenNode
      if (codegenNode.type === 13 /* VNODE_CALL */) {
        codegenNode.isBlock = true
        helper(OPEN_BLOCK)
        helper(CREATE_BLOCK)
      }
      root.codegenNode = codegenNode
    } else {
      // - single <slot/>, IfNode, ForNode: already blocks.
      // - single text node: always patched.
      // root codegen falls through via genNode()
      root.codegenNode = child
    }
  } else if (children.length > 1) {
    // root has multiple nodes - return a fragment block.
    root.codegenNode = createVNodeCall(
      context,
      helper(FRAGMENT),
      undefined,
      root.children,
      `${64 /* STABLE_FRAGMENT */} /* ${
        PatchFlagNames[64 /* STABLE_FRAGMENT */]
      } */`,
      undefined,
      undefined,
      true
    )
  } else;
}
```

如果根节点的子节点是元素节点，则会将其转换为`block`节点，如果根节有多个子节点，那么它的`codegenNode`就会以`fragment`作为标签。
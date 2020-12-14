版本是Vue.js v2.6.11。

`AST`树构建完以后，就会对其进行`optimize`，这个过程其实就是向`AST`继续扩展一些属性。

之前构建的`AST`：

```javascript
{
    type: 1
    tag: "ul"
    attrsList: []
    attrsMap: {class: "list", v-if: "list.length"}
    rawAttrsMap: {
        class: {name: "class", value: "list", start: 4, end: 16}, 
        v-if: {name: "v-if", value: "list.length", start: 17, end: 35}
    }
    parent: undefined
    children: [{
            type: 1
            tag: "li"
            attrsList: []
    		attrsMap: {v-for: "(item, index) in list"}
    		rawAttrsMap: {v-for: {…}}
    		parent: {type: 1, tag: "ul", attrsList: Array(0), attrsMap: {…}, rawAttrsMap: {…}, …}
    		children: [{
                    type: 2
                    expression: "_s(index)+":"+_s(item)"
                    tokens: [{@binding: "index"},":",{@binding: "item"}]
                    text: "{{index}}:{{item}}"
                    start: 70
                    end: 88
            }]
    		start: 36
    		end: 93
    		for: "list"
    		alias: "item"
			iterator1: "index"
			plain: true
    }]
    start: 0
    end: 98
    if: "list.length"
    ifConditions: [{exp: "list.length", block: {…}}]
    plain: false
    staticClass: ""list""
}
```

首先来看入口，源码在`src/compiler/optimizer.js`：

```javascript
export function optimize (root: ?ASTElement, options: CompilerOptions) {
  if (!root) return
  isStaticKey = genStaticKeysCached(options.staticKeys || '')
  isPlatformReservedTag = options.isReservedTag || no
  // first pass: mark all non-static nodes.
  markStatic(root)
  // second pass: mark static roots.
  markStaticRoots(root, false)
}
```

`markStatic`源码在`src/compiler/optimizer.js`：

```javascript
function markStatic (node: ASTNode) {
  node.static = isStatic(node)
  if (node.type === 1) {
    // do not make component slot content static. this avoids
    // 1. components not able to mutate slot nodes
    // 2. static slot content fails for hot-reloading
    if (
      !isPlatformReservedTag(node.tag) &&
      node.tag !== 'slot' &&
      node.attrsMap['inline-template'] == null
    ) {
      return
    }
    for (let i = 0, l = node.children.length; i < l; i++) {
      const child = node.children[i]
      markStatic(child)
      if (!child.static) {
        node.static = false
      }
    }
    if (node.ifConditions) {
      for (let i = 1, l = node.ifConditions.length; i < l; i++) {
        const block = node.ifConditions[i].block
        markStatic(block)
        if (!block.static) {
          node.static = false
        }
      }
    }
  }
}
```

首先向`AST`对象添加`static`属性，值为`isStatic`的返回值，`isStatic`源码在`src/compiler/optimizer.js`：

```javascript
function isStatic (node: ASTNode): boolean {
  if (node.type === 2) { // expression
    return false
  }
  if (node.type === 3) { // text
    return true
  }
  return !!(node.pre || (
    !node.hasBindings && // no dynamic bindings
    !node.if && !node.for && // not v-if or v-for or v-else
    !isBuiltInTag(node.tag) && // not a built-in
    isPlatformReservedTag(node.tag) && // not a component
    !isDirectChildOfTemplateFor(node) &&
    Object.keys(node).every(isStaticKey)
  ))
}
```

我们传入的`AST`是`ul`，`type`是`1`，并且它是有`if`属性的，所以是非静态的。

由于`ul`的`type`是`1`，会循环它的`children`，继续执行`markStatic`，`ul`的`children`是`li`，并且它有`for`属性，所以也是一个非静态的，这时候会继续，循环`li`的`children`，是一个文本表达式，直接被标记为非静态的，由于文本表达式的`type`是`3`，所以不会再次循环递归调用`markStatic`。

我们回到循环`li`的`children`这里，会判断`child`也就是文本表达式的`static`为`false`时，那么就会标记`li`也为非静态，这是因为如果子节点是非静态，那父节点必然是非静态。

回到循环`ul`的`childern`地方，同样，因为`ul`的`child`为非静态，`ul`会再次被标记为非静态。由于`ul`有`ifConditions`属性，进入`if (node.ifConditions)`分支，但是由于其实索引是1，而`ifConditions`长度也为`1`，并不会进入循环。这个循环的主要作用是，遍历`v-esle`和`v-else-if`元素，因为这两种元素并不会存放到某个`AST`的`children`中，而是存放在`ifConditions`中。

结束`markStatic`，进入`markStaticRoots`，源码在`src/compiler/optimizer.js`：

```javascript
function markStaticRoots (node: ASTNode, isInFor: boolean) {
  if (node.type === 1) {
    if (node.static || node.once) {
      node.staticInFor = isInFor
    }
    // For a node to qualify as a static root, it should have children that
    // are not just static text. Otherwise the cost of hoisting out will
    // outweigh the benefits and it's better off to just always render it fresh.
    if (node.static && node.children.length && !(
      node.children.length === 1 &&
      node.children[0].type === 3
    )) {
      node.staticRoot = true
      return
    } else {
      node.staticRoot = false
    }
    if (node.children) {
      for (let i = 0, l = node.children.length; i < l; i++) {
        markStaticRoots(node.children[i], isInFor || !!node.for)
      }
    }
    if (node.ifConditions) {
      for (let i = 1, l = node.ifConditions.length; i < l; i++) {
        markStaticRoots(node.ifConditions[i].block, isInFor)
      }
    }
  }
}
```

`ul`为非静态，其`staticRoot`为`false`，接下来，会遍历`children`递归执行`markStaticRoots`，`li`的`staticRoot`为`false`，而`li`的`children`的文本表达式的`type`为`2`，不会设置`staticRoot`。

回到循环`ul`的`children`，进入`if(node.ifConditions)`这个分支，这里同样不会进入，原因和`markStatic`一样。

到这里就结束了优化`AST`整棵树的过程，这个过程相比创建`AST`要简单很多，我们看一下最后优化后的`AST`：

```javascript
{
    type: 1
    tag: "ul"
    attrsList: []
    attrsMap: {class: "list", v-if: "list.length"}
    rawAttrsMap: {
        class: {name: "class", value: "list", start: 4, end: 16}, 
        v-if: {name: "v-if", value: "list.length", start: 17, end: 35}
    }
    parent: undefined
    children: [{
            type: 1
            tag: "li"
            attrsList: []
    		attrsMap: {v-for: "(item, index) in list"}
    		rawAttrsMap: {v-for: {…}}
    		parent: {type: 1, tag: "ul", attrsList: Array(0), attrsMap: {…}, rawAttrsMap: {…}, …}
    		children: [{
                    type: 2
                    expression: "_s(index)+":"+_s(item)"
                    tokens: [{@binding: "index"},":",{@binding: "item"}]
                    text: "{{index}}:{{item}}"
                    start: 70
                    end: 88
    				// 新属性
            		static: false,
            }]
    		start: 36
    		end: 93
    		for: "list"
    		alias: "item"
    		iterator1: "index"
			plain: true
        	// 新属性
            static: false,
            // 新属性	
            staticRoot: false
    }]
    start: 0
    end: 98
    if: "list.length"
    ifConditions: [{exp: "list.length", block: {…}}]
    plain: false
    staticClass: ""list""
    // 新属性
    static: false
    // 新属性	
	staticRoot: false
}
```

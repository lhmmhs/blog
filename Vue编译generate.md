版本是Vue.js v2.6.11。 

Vue编译的最后一步是`generate`，它是将`AST`树转换成代码字符串的过程，这个过程也是比较复杂的，我们还是会用之前的例子，去走一遍这个过程。

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
            static: false,
            staticRoot: false
    }]
    start: 0
    end: 98
    if: "list.length"
    ifConditions: [{exp: "list.length", block: {…}}]
    plain: false
    staticClass: ""list""
    static: false
	staticRoot: false
}
```

`generate`的源码在`src/compiler/codegen/index.js`：

```javascript
export function generate (
  ast: ASTElement | void,
  options: CompilerOptions
): CodegenResult {
  const state = new CodegenState(options)
  const code = ast ? genElement(ast, state) : '_c("div")'
  return {
    render: `with(this){return ${code}}`,
    staticRenderFns: state.staticRenderFns
  }
}
```

可以看到主要是执行`genElement`方法，最后返回一个对象，其中包含`redner`函数的代码字符串。`genElement`源码在`src/compiler/codegen/index.js`：

```javascript
export function genElement (el: ASTElement, state: CodegenState): string {
  if (el.parent) {
    el.pre = el.pre || el.parent.pre
  }

  if (el.staticRoot && !el.staticProcessed) {
    return genStatic(el, state)
  } else if (el.once && !el.onceProcessed) {
    return genOnce(el, state)
  } else if (el.for && !el.forProcessed) {
    return genFor(el, state)
  } else if (el.if && !el.ifProcessed) {
    return genIf(el, state)
  } else if (el.tag === 'template' && !el.slotTarget && !state.pre) {
    return genChildren(el, state) || 'void 0'
  } else if (el.tag === 'slot') {
    return genSlot(el, state)
  } else {
    // component or element
    let code
    if (el.component) {
      code = genComponent(el.component, el, state)
    } else {
      let data
      if (!el.plain || (el.pre && state.maybeComponent(el))) {
        data = genData(el, state)
      }

      const children = el.inlineTemplate ? null : genChildren(el, state, true)
      code = `_c('${el.tag}'${
        data ? `,${data}` : '' // data
      }${
        children ? `,${children}` : '' // children
      })`
    }
    // module transforms
    for (let i = 0; i < state.transforms.length; i++) {
      code = state.transforms[i](el, code)
    }
    return code
  }
}
```

该方法就是根据`AST`各种属性去执行不同方法生成代码字符串。

***第一次进入`genElement`***，首先判断的是`el.parent`，此时的`el`是根`AST`，所以`parent`为`undefined`，接着会判断`AST`的各种`V`指令，会进入`el.if`分支，进入`genif`，源码在`src/compiler/codegen/index.js`：

```javascript
export function genIf (
  el: any,
  state: CodegenState,
  altGen?: Function,
  altEmpty?: string
): string {
  el.ifProcessed = true // avoid recursion
  return genIfConditions(el.ifConditions.slice(), state, altGen, altEmpty)
}
```

先给`AST`添加属性`ifProcessed`，避免递归调用`genIf`，然后调用`genIfConditions`，源码在`src/compiler/codegen/index.js`：

```javascript
function genIfConditions (
  conditions: ASTIfConditions,
  state: CodegenState,
  altGen?: Function,
  altEmpty?: string
): string {
  if (!conditions.length) {
    return altEmpty || '_e()'
  }

  const condition = conditions.shift()
  if (condition.exp) {
    return `(${condition.exp})?${
      genTernaryExp(condition.block)
    }:${
      genIfConditions(conditions, state, altGen, altEmpty)
    }`
  } else {
    return `${genTernaryExp(condition.block)}`
  }

  // v-if with v-once should generate code like (a)?_m(0):_m(1)
  function genTernaryExp (el) {
    return altGen
      ? altGen(el, state)
      : el.once
        ? genOnce(el, state)
        : genElement(el, state)
  }
}
```

先判断`AST`的`conditions`长度，为`0`直接返回`'_e()'`，显然我们不会进入这个分支，我们会进入`if (condition.exp)`分支，并且执行`genTernaryExp(condition.block)`，`genTernaryExp`内部会执行`genElement`，也就是***第二次进入`genElement`***，而这次，会进入到`else`逻辑中，会执行`data=genData(el, state)`，其源码在`src/compiler/codegen/index.js`：

```javascript
export function genData (el: ASTElement, state: CodegenState): string {
  let data = '{'

  // directives first.
  // directives may mutate the el's other properties before they are generated.
  const dirs = genDirectives(el, state)
  if (dirs) data += dirs + ','

  // key
  if (el.key) {
    data += `key:${el.key},`
  }
  // ref
  if (el.ref) {
    data += `ref:${el.ref},`
  }
  if (el.refInFor) {
    data += `refInFor:true,`
  }
  // pre
  if (el.pre) {
    data += `pre:true,`
  }
  // record original tag name for components using "is" attribute
  if (el.component) {
    data += `tag:"${el.tag}",`
  }
  // module data generation functions
  for (let i = 0; i < state.dataGenFns.length; i++) {
    data += state.dataGenFns[i](el)
  }
  // attributes
  if (el.attrs) {
    data += `attrs:${genProps(el.attrs)},`
  }
  // DOM props
  if (el.props) {
    data += `domProps:${genProps(el.props)},`
  }
  // event handlers
  if (el.events) {
    data += `${genHandlers(el.events, false)},`
  }
  if (el.nativeEvents) {
    data += `${genHandlers(el.nativeEvents, true)},`
  }
  // slot target
  // only for non-scoped slots
  if (el.slotTarget && !el.slotScope) {
    data += `slot:${el.slotTarget},`
  }
  // scoped slots
  if (el.scopedSlots) {
    data += `${genScopedSlots(el, el.scopedSlots, state)},`
  }
  // component v-model
  if (el.model) {
    data += `model:{value:${
      el.model.value
    },callback:${
      el.model.callback
    },expression:${
      el.model.expression
    }},`
  }
  // inline-template
  if (el.inlineTemplate) {
    const inlineTemplate = genInlineTemplate(el, state)
    if (inlineTemplate) {
      data += `${inlineTemplate},`
    }
  }
  data = data.replace(/,$/, '') + '}'
  // v-bind dynamic argument wrap
  // v-bind with dynamic arguments must be applied using the same v-bind object
  // merge helper so that class/style/mustUseProp attrs are handled correctly.
  if (el.dynamicAttrs) {
    data = `_b(${data},"${el.tag}",${genProps(el.dynamicAttrs)})`
  }
  // v-bind data wrap
  if (el.wrapData) {
    data = el.wrapData(data)
  }
  // v-on data wrap
  if (el.wrapListeners) {
    data = el.wrapListeners(data)
  }
  return data
}
```

这个代码比较长，主要的作用就是根据`AST`的不同属性向`data`这个字符串去拼接不同的字符串，我们会执行下面这个方法：

```javascript
// module data generation functions
for (let i = 0; i < state.dataGenFns.length; i++) {
  data += state.dataGenFns[i](el)
}
```

`state.dataGenFns`根据`this.dataGenFns = pluckModuleFunction(options.modules, 'genData')`生成的，里面是一些`modules`种的`genData`函数，其中`class`和`style`有`genData`函数。

```javascript
// 源码在src/web/platforms/compiler/modules/style.js
function genData (el: ASTElement): string {
  let data = ''
  if (el.staticStyle) {
    data += `staticStyle:${el.staticStyle},`
  }
  if (el.styleBinding) {
    data += `style:(${el.styleBinding}),`
  }
  return data
}

// 源码在src/web/platforms/compiler/modules/class.js
function genData (el: ASTElement): string {
  let data = ''
  if (el.staticClass) {
    data += `staticClass:${el.staticClass},`
  }
  if (el.classBinding) {
    data += `class:${el.classBinding},`
  }
  return data
}
```

此刻的`AST`是`ul`有`staticClass`属性，会执行`data += staticClass:${el.staticClass}`，`data`就转化为：

```javascript
"{staticClass:"list","
```

后面继续执行`data = data.replace(/,$/, '') + '}'`，会将`,`替换为空字串，并拼接`}`。此时字符串就变成了：

```javascript
"{staticClass:"list"}"
```

返回到第二次进入的`genElement`中，去执行***第一次 `genChildren`***，其源码在`src/compiler/codegen/index.js`：

```javascript

export function genChildren (
  el: ASTElement,
  state: CodegenState,
  checkSkip?: boolean,
  altGenElement?: Function,
  altGenNode?: Function
): string | void {
  const children = el.children
  if (children.length) {
    const el: any = children[0]
    // optimize single v-for
    if (children.length === 1 &&
      el.for &&
      el.tag !== 'template' &&
      el.tag !== 'slot'
    ) {
      const normalizationType = checkSkip
        ? state.maybeComponent(el) ? `,1` : `,0`
        : ``
      return `${(altGenElement || genElement)(el, state)}${normalizationType}`
    }
    const normalizationType = checkSkip
      ? getNormalizationType(children, state.maybeComponent)
      : 0
    const gen = altGenNode || genNode
    return `[${children.map(c => gen(c, state)).join(',')}]${
      normalizationType ? `,${normalizationType}` : ''
    }`
  }
}
```

获取`children`中的第一个元素，会进入`if (children.length === 1 && el.for && el.tag !== 'template' && el.tag !== 'slot')`分支执行`state.maybeComponent`，这个函数先判断元素是不是组件，不是再去判断是不是保留的标签，如果是返回`false`，不是返回`true`，此时的`el`是`li`所以返回`false`，`normalizationType`为`,0`，返回的字符串中又一次执行了`genElement`。

***第三次进入`genElement`***，此时的`el`为`li`，会进入`genFor`，源码在`src/compiler/codegen/index.js`：

```javascript
export function genFor (
  el: any,
  state: CodegenState,
  altGen?: Function,
  altHelper?: string
): string {
  const exp = el.for
  const alias = el.alias
  const iterator1 = el.iterator1 ? `,${el.iterator1}` : ''
  const iterator2 = el.iterator2 ? `,${el.iterator2}` : ''

  if (process.env.NODE_ENV !== 'production' &&
    state.maybeComponent(el) &&
    el.tag !== 'slot' &&
    el.tag !== 'template' &&
    !el.key
  ) {
    state.warn(
      `<${el.tag} v-for="${alias} in ${exp}">: component lists rendered with ` +
      `v-for should have explicit keys. ` +
      `See https://vuejs.org/guide/list.html#key for more info.`,
      el.rawAttrsMap['v-for'],
      true /* tip */
    )
  }

  el.forProcessed = true // avoid recursion
  return `${altHelper || '_l'}((${exp}),` +
    `function(${alias}${iterator1}${iterator2}){` +
      `return ${(altGen || genElement)(el, state)}` +
    '})'
}
```

该函数先获取元素上的`exp`，`alias`，`iterator1`，`iterator2`，这4个属性都是和`v-for`指令相关的属性，然后会将元素上添加`forProcessed`属性，最后反回一个比较复杂的字符串，这里先跳过，因为字符串中又会执行`genElement`。

***第四次进入`genElement`***，因为已经添加了属性`forProcessed`，不会再次进入`genFor`，并且也不会进入`genData`，执行`genChildren`。

***第二次进入 `genChildren`***，此时`el`被赋值为文本表达式，不会进入`if`逻辑，而是去执行下面这行代码：

```javascript
var normalizationType$1 = checkSkip
      ? getNormalizationType(children, state.maybeComponent)
      : 0;
```

`getNormalizationType`获取规范化的种类，源码在`src/compiler/codegen/index.js`：

```javascript
// determine the normalization needed for the children array.
// 0: no normalization needed
// 1: simple normalization needed (possible 1-level deep nested array)
// 2: full normalization needed
function getNormalizationType (
  children: Array<ASTNode>,
  maybeComponent: (el: ASTElement) => boolean
): number {
  let res = 0
  for (let i = 0; i < children.length; i++) {
    const el: ASTNode = children[i]
    if (el.type !== 1) {
      continue
    }
    if (needsNormalization(el) ||
        (el.ifConditions && el.ifConditions.some(c => needsNormalization(c.block)))) {
      res = 2
      break
    }
    if (maybeComponent(el) ||
        (el.ifConditions && el.ifConditions.some(c => maybeComponent(c.block)))) {
      res = 1
    }
  }
  return res
}
```

根据注释可以看到，规范化目的就是`children`的降维，分为3种情况，0代表不需要，1代表只1个层级的规范化，2代表全部规范化。此时我们的`children`中只有一个元素，且它的`type`为`2`，所以直接返回`res`为`0`。

回到***第二次进入的 `genChildren`***，执行`const gen = altGenNode || genNode`，最后返回一个复杂的字符串，字符串中会执行`gen`也就是`genNode`，源码在`src/compiler/codegen/index.js`：

```javascript
function genNode (node: ASTNode, state: CodegenState): string {
  if (node.type === 1) {
    return genElement(node, state)
  } else if (node.type === 3 && node.isComment) {
    return genComment(node)
  } else {
    return genText(node)
  }
}
```

执行`genText(node)`，源码在`src/compiler/codegen/index.js`：

```javascript
export function genText (text: ASTText | ASTExpression): string {
  return `_v(${text.type === 2
    ? text.expression // no need for () because already wrapped in _s()
    : transformSpecialNewlines(JSON.stringify(text.text))
  })`
}
```

此时`text`是文本表达式，`type`是`2`，所以返回的字符串是：

```javascript
"_v(_s(index)+":"+_s(item))"
```

回到***第二次进入的 `genChildren`***，拼接返回的字符串：

```javascript
return `[${children.map(c => gen(c, state)).join(',')}]${
	normalizationType ? `,${normalizationType}` : ''
}`
```

`children`只有一个元素，`normalizationType`为`0`，所以返回的字符串是：

```javascript
"[_v(_s(index)+":"+_s(item))]"
```

现在我们回到***第四次进入`genElement`***，此时的`children`就是上方返回的字符串，接着拼接`code`：

```javascript
code = `_c('${el.tag}'${
	data ? `,${data}` : '' // data
}${
	children ? `,${children}` : '' // children
})`
```

***第四次进入`genElement`***时，`data`时`undefined`，所以最后`code`是这个样子：

```javascript
"_c('li', [_v(_s(index)+":"+_s(item))])"
```

回到`genFor`，看一下`return`拼接的字符串：

```javascript
return `${altHelper || '_l'}((${exp}),` +
    `function(${alias}${iterator1}${iterator2}){` +
      `return ${(altGen || genElement)(el, state)}` +
    '})'
```

`altHelper`是`undefined`，字符串如下：

```javascript
"_l((list),function(item,index){return _c('li', [_v(_s(index)+":"+_s(item))])})"
```

回到***第三次进入`genElement`***，直接返回上面的字符串，接着回到***第一次进入的 `genChildren`***，

此时我们在下列分支中：

```javascript
if (children.length === 1 &&
    el.for &&
    el.tag !== 'template' &&
    el.tag !== 'slot'
) {
    const normalizationType = checkSkip
    ? state.maybeComponent(el) ? `,1` : `,0`
    : ``
    return `${(altGenElement || genElement)(el, state)}${normalizationType}`
}
```

`normalizationType`是`,0`，拼接后的字符串：

```javascript
"_l((list),function(item,index){return _c('li',[_v(_s(index)+":"+_s(item))])}),0"
```

回到***第二次进入`genElement`***，向下执行，`code`拼接：

```javascript
code = `_c('${el.tag}'${
	data ? `,${data}` : '' // data
}${
	children ? `,${children}` : '' // children
})`
```

此时的`children`就是上方返回的字符串，此时的`data`是`"{staticClass:"list"}"`，所以拼接后的字符串：

```javascript
"_c('ul',{staticClass:"list"},_l((list),function(item,index){return _c('li',[_v(_s(index)+":"+_s(item))])}),0)"
```

回到`genTernaryExp`，在回到`genIfConditions`，看一下返回的拼接字符串：

```javascript
return `(${condition.exp})?${
      genTernaryExp(condition.block)
    }:${
      genIfConditions(conditions, state, altGen, altEmpty)
    }`
```

`genTernaryExp(condition.block)`返回的就是上面的字符串，执行`genIfConditions(conditions, state, altGen, altEmpty)`，由于此时的`conditions`已经为空，所以会直接返回`'_e()'`，最后拼接的字符串为：

```javascript
`(list.length)?_c('ul',{staticClass:"list"},_l((list),function(item,index){return _c('li',[_v(_s(index)+":"+_s(item))])}),0):_e()`
```

回到`genIf`，回到***第一次进入`genElement`***，回到`generate`，生成的`code`如上所示，拼接为最终的`render`函数代码字符串：

```javascript
`
with(this){
	(list.length) 
	? _c('ul', 
		{staticClass:"list"}, 
		_l((list), function(item,index){return _c('li', [_v(_s(index)+":"+_s(item))])})
	: _e()
}
`
```

其中`_l`，`_c`，`_v`，`_s`，`_e()`都是函数，其定义大部分都在`src/core/instance/render-helpers/index.js`

```javascript
export function installRenderHelpers (target: any) {
  target._o = markOnce
  target._n = toNumber
  target._s = toString
  target._l = renderList
  target._t = renderSlot
  target._q = looseEqual
  target._i = looseIndexOf
  target._m = renderStatic
  target._f = resolveFilter
  target._k = checkKeyCodes
  target._b = bindObjectProps
  target._v = createTextVNode
  target._e = createEmptyVNode
  target._u = resolveScopedSlots
  target._g = bindObjectListeners
  target._d = bindDynamicKeys
  target._p = prependModifier
}
```

`_c`在`src/core/instance/render.js`

```javascript
export function initRender (vm: Component) {
  vm._vnode = null // the root of the child tree
  vm._staticTrees = null // v-once cached trees
  const options = vm.$options
  const parentVnode = vm.$vnode = options._parentVnode // the placeholder node in parent tree

  //...
  
  vm._c = (a, b, c, d) => createElement(vm, a, b, c, d, false)
    
  //...
}
```

## 总结

`generate`过程就是深度优先遍历`AST`的过程，先生成最深层的节点代码字符串，在慢慢回溯。






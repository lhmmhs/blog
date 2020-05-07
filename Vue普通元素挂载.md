版本是v2.6.11

`Vue`普通元素挂载的过程，涉及到两个核心步骤是`render`和`patch`，其中`render`是将`Vue`实例转化为`vnode`的过程，而`patch`是将`vnode`转化为真实`DOM`的并挂载过程。

```html
<div id="app">
  {{ message }}
</div>
```

```javascript
var app = new Vue({
  el: '#app',
  data: {
    message: 'Hello Vue!'
  }
})
```

如上，直接使用的是官方文档的例子，从`new Vue`开始分析，`Vue`源码：

```javascript
function Vue (options) {
  if (process.env.NODE_ENV !== 'production' &&
    !(this instanceof Vue)
  ) {
    warn('Vue is a constructor and should be called with the `new` keyword')
  }
  this._init(options)
}
```

`Vue`是一个构造函数，逻辑很简单，它的调用方式必须使用`new`，否则会出现警告；`_init`源码在：

```javascript
Vue.prototype._init = function (options?: Object) {
  const vm: Component = this

  // ...

  if (vm.$options.el) {
    // 挂载
    vm.$mount(vm.$options.el)
  }
}
```

挂载是通过执行`vm.$mount`实现的，由于`Vue`可以在不同的平台运行，所以`$mount`实现在不同平台是不同的，`web`平台下，并且模板已经进行编译过了，所以它的实现如下：

```javascript
Vue.prototype.$mount = function (
  el?: string | Element,
  hydrating?: boolean
): Component {
  el = el && inBrowser ? query(el) : undefined
  return mountComponent(this, el, hydrating)
}
```

逻辑很简单，找到`el`元素，执行`mountComponent`函数挂载。

如果没有编译过，那么实如下：

```javascript
const mount = Vue.prototype.$mount
Vue.prototype.$mount = function (
  el?: string | Element,
  hydrating?: boolean
): Component {
  el = el && query(el)

  // ...
  // resolve template/el and convert to render function
  if (!options.render) {
    let template = options.template
    // ...
    if (template) {
      /* istanbul ignore if */
      if (process.env.NODE_ENV !== 'production' && config.performance && mark) {
        mark('compile')
      }

      const { render, staticRenderFns } = compileToFunctions(template, {
        outputSourceRange: process.env.NODE_ENV !== 'production',
        shouldDecodeNewlines,
        shouldDecodeNewlinesForHref,
        delimiters: options.delimiters,
        comments: options.comments
      }, this)
      options.render = render
      options.staticRenderFns = staticRenderFns

      // ...
    }
  }
  return mount.call(this, el, hydrating)
}
```

如上，先将原始的`$mount`缓存，然后修改`$mount`方法，修改后的`$mount`主要是用来编译模板获取`render`函数用的，最后会调用原始的`$mount`方法进行挂载。

`mountComponent`源码：

```javascript
export function mountComponent (
  vm: Component,
  el: ?Element,
  hydrating?: boolean
): Component {
  vm.$el = el
  // ...

  let updateComponent
  /* istanbul ignore if */
  if (process.env.NODE_ENV !== 'production' && config.performance && mark) {
    // ...
  } else {
    updateComponent = () => {
      vm._update(vm._render(), hydrating)
    }
  }

  // we set this to vm._watcher inside the watcher's constructor
  // since the watcher's initial patch may call $forceUpdate (e.g. inside child
  // component's mounted hook), which relies on vm._watcher being already defined
  new Watcher(vm, updateComponent, noop, {
    before () {
      if (vm._isMounted && !vm._isDestroyed) {
        callHook(vm, 'beforeUpdate')
      }
    }
  }, true /* isRenderWatcher */)
  hydrating = false

  // manually mounted instance, call mounted on self
  // mounted is called for render-created child components in its inserted hook
  if (vm.$vnode == null) {
    vm._isMounted = true
    callHook(vm, 'mounted')
  }
  return vm
}
```

该函数定义了`updateComponent`并初始化，这个函数就是核心`render`和`patch`执行入口，它的执行时机是在`new Watcher`中。

### render

`vm._render`方法源码：

```javascript
Vue.prototype._render = function (): VNode {
  const vm: Component = this
  const { render, _parentVnode } = vm.$options

  // ...
  let vnode
  try {
    // There's no need to maintain a stack because all render fns are called
    // separately from one another. Nested component's render fns are called
    // when parent component is patched.
    currentRenderingInstance = vm
    vnode = render.call(vm._renderProxy, vm.$createElement)
  } catch (e) {
    // ...
  } finally {
    currentRenderingInstance = null
  }
  // ...
  return vnode
}
```

调用`render.call(vm._renderProxy, vm.$createElement)`，`render`是可以接收一个参数的，这个参数是一个方法，它是用来创建`vnode`，也就是`vm.$createElement`，源码：

```javascript
export function initRender (vm: Component) {
  // ...
  // bind the createElement fn to this instance
  // so that we get proper render context inside it.
  // args order: tag, data, children, normalizationType, alwaysNormalize
  // internal version is used by render functions compiled from templates
  vm._c = (a, b, c, d) => createElement(vm, a, b, c, d, false)
  // normalization is always applied for the public version, used in
  // user-written render functions.
  vm.$createElement = (a, b, c, d) => createElement(vm, a, b, c, d, true)
}
```

`vm._c`和`vm.$createElement`都是`vm.$createElement`的实现，前者是编译器生成`render`时会使用，后者是用户手写`render`时使用，最终都会执行`createElement`函数。

根据例子而言，是编译器生成的`render`：

```javascript
(function anonymous() {
    with (this) {
        return _c('div', {
            attrs: {
                "id": "app"
            }
        }, [_v(_s(message))])
    }
})
```

`createElement`函数源码：

```javascript
export function createElement (
  context: Component,
  tag: any,
  data: any,
  children: any,
  normalizationType: any,
  alwaysNormalize: boolean
): VNode | Array<VNode> {
  if (Array.isArray(data) || isPrimitive(data)) {
    normalizationType = children
    children = data
    data = undefined
  }
  if (isTrue(alwaysNormalize)) {
    normalizationType = ALWAYS_NORMALIZE
  }
  return _createElement(context, tag, data, children, normalizationType)
}
```

最终是执行`_createElement`函数执行，源码：

```javascript
export function _createElement (
  context: Component,
  tag?: string | Class<Component> | Function | Object,
  data?: VNodeData,
  children?: any,
  normalizationType?: number
): VNode | Array<VNode> {
  // ...
  let vnode, ns
  if (typeof tag === 'string') {
    let Ctor
    ns = (context.$vnode && context.$vnode.ns) || config.getTagNamespace(tag)
    if (config.isReservedTag(tag)) {
      // ...
    } else if ((!data || !data.pre) && isDef(Ctor = resolveAsset(context.$options, 'components', tag))) {
      // component
      vnode = createComponent(Ctor, data, context, children, tag)
    } else {
      // unknown or unlisted namespaced elements
      // check at runtime because it may get assigned a namespace when its
      // parent normalizes children
      vnode = new VNode(
        tag, data, children,
        undefined, undefined, context
      )
    }
  } else {
    // direct component options / constructor
    vnode = createComponent(tag, data, context, children)
  }
  if (Array.isArray(vnode)) {
    return vnode
  } else if (isDef(vnode)) {
    if (isDef(ns)) applyNS(vnode, ns)
    if (isDef(data)) registerDeepBindings(data)
    return vnode
  } else {
    return createEmptyVNode()
  }
}
```

如上，`_createElement`根据`tag`来区分`vnode`种类，`tag`为字符串的情况下，可能是普通元素或是组件，否则是组件，最后会返回创建好的`vnode`。

### patch

获取到`vnode`后，执行`vm._update`：

```javascript
Vue.prototype._update = function (vnode: VNode, hydrating?: boolean) {
  const vm: Component = this
  const prevEl = vm.$el
  const prevVnode = vm._vnode
  const prevActiveInstance = activeInstance
  activeInstance = vm
  vm._vnode = vnode
  // ...
  if (!prevVnode) {
    // initial render
    vm.$el = vm.__patch__(vm.$el, vnode, hydrating, false /* removeOnly */)
  } else {
    // updates
    vm.$el = vm.__patch__(prevVnode, vnode)
  }
  // ...
}
```

`_update`方法内部执行的是`vm.__patch__`，`vm.__patch__`可以进行首次渲染，也可以进行数据更新后的渲染，其判断的依据是`prevVnode`，首次渲染`vm._vnode`为`undefined`，所以`prevVnode`也是`undefined`。

```javascript
Vue.prototype.__patch__ = inBrowser ? patch : noop
```

`vm.__patch__`方法的实现不同平台也是不同的，在`web`平台，如果是浏览器环境，实现如下：

```javascript
const modules = platformModules.concat(baseModules)

export const patch: Function = createPatchFunction({ nodeOps, modules })
```

`patch`最终是通过`createPatchFunction`创建的，`createPatchFunction`接收的参数`nodeOps`是`web`平台下所有的`DOM`操作原生`api`，而`modules`是`web`平台下的处理`DOM`属性，如`class`，`style`，`event`的模块函数。

`createPatchFunction`源码：

```javascript
export function createPatchFunction (backend) {
  // ...

  return function patch (oldVnode, vnode, hydrating, removeOnly) {
    // ...

    let isInitialPatch = false
    const insertedVnodeQueue = []

    if (isUndef(oldVnode)) {
      // ...
    } else {
      const isRealElement = isDef(oldVnode.nodeType)
      if (!isRealElement && sameVnode(oldVnode, vnode)) {
        // ...
      } else {
        if (isRealElement) {
          // ...
          // either not server-rendered, or hydration failed.
          // create an empty node and replace it
          oldVnode = emptyNodeAt(oldVnode)
        }

        // replacing existing element
        const oldElm = oldVnode.elm
        const parentElm = nodeOps.parentNode(oldElm)

        // create new node
        createElm(
          vnode,
          insertedVnodeQueue,
          // extremely rare edge case: do not insert if old element is in a
          // leaving transition. Only happens when combining transition +
          // keep-alive + HOCs. (#4590)
          oldElm._leaveCb ? null : parentElm,
          nodeOps.nextSibling(oldElm)
        )
          
        // ...

        // destroy old node
        if (isDef(parentElm)) {
          removeVnodes([oldVnode], 0, 0)
        } else if (isDef(oldVnode.tag)) {
          invokeDestroyHook(oldVnode)
        }
      }
    }

    invokeInsertHook(vnode, insertedVnodeQueue, isInitialPatch)
    return vnode.elm
  }
}
```

最终返回的`patch`函数就是`vm.__patch__`。

根据例子分析这个`patch`函数，它的第一个参数是模板中的`<div id="app">`元素，第二个参数是`div`对应的`vnode`，`patch`过程中，会先将`<div id="app">`通过执行`emptyNodeAt`转化为`vnode`，然后获取它的父节点，执行`createElm`：

```javascript
function createElm (
  vnode,
  insertedVnodeQueue,
  parentElm,
  refElm,
  nested,
  ownerArray,
  index
) {
  // ...

  const data = vnode.data
  const children = vnode.children
  const tag = vnode.tag
  if (isDef(tag)) {
    // ...
      
    vnode.elm = vnode.ns
      ? nodeOps.createElementNS(vnode.ns, tag)
      : nodeOps.createElement(tag, vnode)
    setScope(vnode)

    /* istanbul ignore if */
    if (__WEEX__) {
      // ...
    } else {
      createChildren(vnode, children, insertedVnodeQueue)
      // ...
      insert(parentElm, vnode.elm, refElm)
    }

    // ...
  } else if (isTrue(vnode.isComment)) {
    // 注释节点
    vnode.elm = nodeOps.createComment(vnode.text)
    insert(parentElm, vnode.elm, refElm)
  } else {
    // 文本节点
    vnode.elm = nodeOps.createTextNode(vnode.text)
    insert(parentElm, vnode.elm, refElm)
  }
}
```

如上，先拿到`vnode.tag`，`tag`存在，创建一个占位符元素，由于现在的`vnode`是`<div id="app">`所对应的，所以占位符元素是`<div>`。

执行`createElm`去遍历`vnode`的`children`：

```javascript
function createChildren (vnode, children, insertedVnodeQueue) {
  if (Array.isArray(children)) {
    if (process.env.NODE_ENV !== 'production') {
      checkDuplicateKeys(children)
    }
    for (let i = 0; i < children.length; ++i) {
      createElm(children[i], insertedVnodeQueue, vnode.elm, null, true, children, i)
    }
  } else if (isPrimitive(vnode.text)) {
    nodeOps.appendChild(vnode.elm, nodeOps.createTextNode(String(vnode.text)))
  }
}
```

`children`是当前`vnode`下的所有子`vnode`，遍历后递归执行`createElm`。

根据案例，`children`中只有一个元素文本节点的`vnode`，也就是`hello world`，此时递归执行`createElm`，会命中最后的文本节点逻辑，先执行原生`DOM`的`api`创建文本节点，然后执行`insert`，将它插入到新创建的占位符元素中。

`insert`是真正挂载`DOM`的函数：

```javascript
function insert (parent, elm, ref) {
  if (isDef(parent)) {
    if (isDef(ref)) {
      if (nodeOps.parentNode(ref) === parent) {
        nodeOps.insertBefore(parent, elm, ref)
      }
    } else {
      nodeOps.appendChild(parent, elm)
    }
  }
}

export function insertBefore (parentNode: Node, newNode: Node, referenceNode: Node) {
  parentNode.insertBefore(newNode, referenceNode)
}

export function appendChild (node: Node, child: Node) {
  node.appendChild(child)
}
```

这里是调用原生的`api`进行真正的`DOM`操作。

回到第一次执行`createElm`的时候，执行`insert`，此时是将占位符元素插入到`body`中，执行到这里`html`中会有2个`<div id="app">`的元素，如下：

```html
<body>
  <div id="app">{{message}}</div>
  <div id="app">Hello Vue!</div>
</body>
```

回到`patch`，执行`removeVnodes`会将原先的`<div id="app">{{message}}</div>`删除。


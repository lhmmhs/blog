版本是v2.6.11

`Vue`组件挂载的过程，同样需要`render`和`patch`，只是在执行它们的过程中会进入不同的分支。

例子：

```javascript
const App = {
  template: "<div><Bar /></div>",
  components: { Bar }
}

const Bar = {
  template: "<div>Bar</div>"
}

new Vue({
  el: "#app",
  render: h => h(App)
})
```

## 组件render

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
    // 命中
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

`_createElement`是真正初始化`vnode`的函数，它是根据`tag`来创建不同种类的`vnode`，组件`App`本质是一个对象，它的`tag`是对象，所以会命中`else`逻辑，通过执行`createComponent`创建组件`vnode`，源码：

```javascript
export function createComponent (
  Ctor: Class<Component> | Function | Object | void,
  data: ?VNodeData,
  context: Component,
  children: ?Array<VNode>,
  tag?: string
): VNode | Array<VNode> | void {
  if (isUndef(Ctor)) {
    return
  }

  // Vue
  const baseCtor = context.$options._base

  // plain options object: turn it into a constructor
  if (isObject(Ctor)) {
    Ctor = baseCtor.extend(Ctor)
  }

  // ...

  // install component management hooks onto the placeholder node
  installComponentHooks(data)

  // return a placeholder vnode
  const name = Ctor.options.name || tag
  const vnode = new VNode(
    `vue-component-${Ctor.cid}${name ? `-${name}` : ''}`,
    data, undefined, undefined, undefined, context,
    { Ctor, propsData, listeners, tag, children },
    asyncFactory
  )

  // ...

  return vnode
}
```

先获取到`Vue`，通过`Vue.extend`构造组件的构造函数，源码：

```javascript
Vue.extend = function (extendOptions: Object): Function {
  extendOptions = extendOptions || {}
  const Super = this
  const SuperId = Super.cid
  const cachedCtors = extendOptions._Ctor || (extendOptions._Ctor = {})
  if (cachedCtors[SuperId]) {
    return cachedCtors[SuperId]
  }

  const name = extendOptions.name || Super.options.name
  if (process.env.NODE_ENV !== 'production' && name) {
    validateComponentName(name)
  }
  
  // 组件构造函数
  const Sub = function VueComponent (options) {
    this._init(options)
  }
  // 原型继承
  Sub.prototype = Object.create(Super.prototype)
  Sub.prototype.constructor = Sub
  Sub.cid = cid++
  Sub.options = mergeOptions(
    Super.options,
    extendOptions
  )
  Sub['super'] = Super

  // For props and computed properties, we define the proxy getters on
  // the Vue instances at extension time, on the extended prototype. This
  // avoids Object.defineProperty calls for each instance created.
  if (Sub.options.props) {
    initProps(Sub)
  }
  if (Sub.options.computed) {
    initComputed(Sub)
  }

  // allow further extension/mixin/plugin usage
  Sub.extend = Super.extend
  Sub.mixin = Super.mixin
  Sub.use = Super.use

  // create asset registers, so extended classes
  // can have their private assets too.
  ASSET_TYPES.forEach(function (type) {
    Sub[type] = Super[type]
  })
  // enable recursive self-lookup
  if (name) {
    Sub.options.components[name] = Sub
  }

  // keep a reference to the super options at extension time.
  // later at instantiation we can check if Super's options have
  // been updated.
  Sub.superOptions = Super.options
  Sub.extendOptions = extendOptions
  Sub.sealedOptions = extend({}, Sub.options)

  // cache constructor
  cachedCtors[SuperId] = Sub
  return Sub
}
```

定义组件的构造函数`Sub`，并继承`Vue`，对`Sub`进行扩展，最终返回。

安装组件钩子函数：

```javascript
function installComponentHooks(data: VNodeData) {
  const hooks = data.hook || (data.hook = {})
  for (let i = 0; i < hooksToMerge.length; i++) {
    const key = hooksToMerge[i]
    const existing = hooks[key]
    const toMerge = componentVNodeHooks[key]
    if (existing !== toMerge && !(existing && existing._merged)) {
      hooks[key] = existing ? mergeHook(toMerge, existing) : toMerge
    }
  }
}

function mergeHook(f1: any, f2: any): Function {
  const merged = (a, b) => {
    // flow complains about extra args which is why we use any
    f1(a, b)
    f2(a, b)
  }
  merged._merged = true
  return merged
}

const hooksToMerge = Object.keys(componentVNodeHooks)

const componentVNodeHooks = {
  init(vnode: VNodeWithData, hydrating: boolean): ?boolean {...},
  prepatch(oldVnode: MountedComponentVNode, vnode: MountedComponentVNode) {...},
  insert(vnode: MountedComponentVNode) {...},
  destroy(vnode: MountedComponentVNode) {...}
}
```

向组件的`data.hook`上添加四个钩子函数，如果某个钩子函数已经存在，会将已存在的钩子和新添加的钩子包装在一个函数内，依次执行。

最后是实例化`vnode`：

```javascript
const vnode = new VNode(
  `vue-component-${Ctor.cid}${name ? `-${name}` : ''}`,
  data, undefined, undefined, undefined, context,
  { Ctor, propsData, listeners, tag, children },
  asyncFactory
)
```

## 组件patch

`patch`的过程会执行`createElm`创建`DOM`并挂载，其源码：

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

  if (createComponent(vnode, insertedVnodeQueue, parentElm, refElm)) {
    return
  }

  // ...
}
```

`createComponent`函数会试图去初始化组件，如果是组件最终会返回`true`直接`return`。

```javascript
function createComponent (vnode, insertedVnodeQueue, parentElm, refElm) {
  let i = vnode.data
  if (isDef(i)) {
    const isReactivated = isDef(vnode.componentInstance) && i.keepAlive
    if (isDef(i = i.hook) && isDef(i = i.init)) {
      i(vnode, false /* hydrating */)
    }
    // ...
  }
}

const componentVNodeHooks = {
  init(vnode: VNodeWithData, hydrating: boolean): ?boolean {
    if (
      vnode.componentInstance &&
      !vnode.componentInstance._isDestroyed &&
      vnode.data.keepAlive
    ) {
      // kept-alive components, treat as a patch
      const mountedNode: any = vnode // work around flow
      componentVNodeHooks.prepatch(mountedNode, mountedNode)
    } else {
      const child = vnode.componentInstance = createComponentInstanceForVnode(
        vnode,
        activeInstance
      )
      child.$mount(hydrating ? vnode.elm : undefined, hydrating)
    }
  },
  // ...
}
```

`createComponent`就是执行之前安装过的`init`钩子函数，而`init`钩子函数中主要是执行`createComponentInstanceForVnode`，源码：

```javascript
export function createComponentInstanceForVnode(
  vnode: any, // we know it's MountedComponentVNode but flow doesn't
  parent: any, // activeInstance in lifecycle state
): Component {
  const options: InternalComponentOptions = {
    _isComponent: true,
    _parentVnode: vnode,
    parent
  }
  // check inline-template render functions
  const inlineTemplate = vnode.data.inlineTemplate
  if (isDef(inlineTemplate)) {
    options.render = inlineTemplate.render
    options.staticRenderFns = inlineTemplate.staticRenderFns
  }
  // vnode.componentOptions.Ctor -> Sub = function VueComponent() {}
  return new vnode.componentOptions.Ctor(options)
}
```

构造一个配置选项`options`，实例化组件，进而执行`_init`方法。

```javascript
Vue.prototype._init = function (options?: Object) {
  // ...
    
  if (options && options._isComponent) {
    // optimize internal component instantiation
    // since dynamic options merging is pretty slow, and none of the
    // internal component options needs special treatment.
    initInternalComponent(vm, options)
  } else {
    // ...
  }
  
  // ...

  if (vm.$options.el) {
    vm.$mount(vm.$options.el)
  }
}
```

组件`_init`主要是执行`initInternalComponent`进行配置选项的合并，源码：

```javascript
export function initInternalComponent (vm: Component, options: InternalComponentOptions) {
  const opts = vm.$options = Object.create(vm.constructor.options)
  // doing this because it's faster than dynamic enumeration.
  const parentVnode = options._parentVnode
  opts.parent = options.parent
  opts._parentVnode = parentVnode

  const vnodeComponentOptions = parentVnode.componentOptions
  opts.propsData = vnodeComponentOptions.propsData
  opts._parentListeners = vnodeComponentOptions.listeners
  opts._renderChildren = vnodeComponentOptions.children
  opts._componentTag = vnodeComponentOptions.tag

  if (options.render) {
    opts.render = options.render
    opts.staticRenderFns = options.staticRenderFns
  }
}
```

给组件的实例添加`$options`，并向该属性添加一些属性，其中`opts.parent`是父组件实例，`opts._parentVnode`是占位符`vnode`。

由于组件实例的`$options`没有`el`属性，所以不会进行`vm.$mount`挂载。

回到组件的钩子函数`init`，在这里会执行`child.$mount`进行挂载，执行`$mount`，就会执行`mountComponent`，进而执行`_render`：

```javascript
Vue.prototype._render = function (): VNode {
  const vm: Component = this
  const { render, _parentVnode } = vm.$options
  //...

  // set parent vnode. this allows render functions to have access
  // to the data on the placeholder node.
  vm.$vnode = _parentVnode
  // render self
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
    // ...
  }
  // ...
  // set parent
  vnode.parent = _parentVnode
  return vnode
}
```

有几个关键步骤，`vm.$vnode`会被赋值，它是占位符`vnode`，而此时通过`render`创建的`vnode`是组件内部根节点`<div>`的`vnode`，称这个`vnode`是渲染`vnode`，该`vnode`的`parent`属性也是占位符`vnode`。

举个例子：

```html
<!-- App.vue -->
<template>
	<div>
        <Foo></Foo>
    </div>
</template>

<!-- Foo.vue -->
<template>
	<div>Foo</div>
</template>
```

`App`组件内的`<Foo></Foo>`就是占位符`vnode`，而`Foo`组件内的根节点`<div>`就是渲染`vnode`。

此时的`render`就是普通元素`<div>`的`render`。

那么`patch`的过程，也就普通元素的`patch`了，但是会有区别：

```javascript
Vue.prototype._update = function (vnode: VNode, hydrating?: boolean) {
  const vm: Component = this
  const prevEl = vm.$el
  const prevVnode = vm._vnode
  const restoreActiveInstance = setActiveInstance(vm)
  vm._vnode = vnode
  // Vue.prototype.__patch__ is injected in entry points
  // based on the rendering backend used.
  if (!prevVnode) {
    // initial render
    vm.$el = vm.__patch__(vm.$el, vnode, hydrating, false /* removeOnly */)
  } else {
    // updates
    vm.$el = vm.__patch__(prevVnode, vnode)
  }
  restoreActiveInstance()
  // ...
}
```

此时的组件的实例是没有`$el`属性的。

```javascript
return function patch (oldVnode, vnode, hydrating, removeOnly) {
  if (isUndef(vnode)) {
    if (isDef(oldVnode)) invokeDestroyHook(oldVnode)
    return
  }

  let isInitialPatch = false
  const insertedVnodeQueue = []

  if (isUndef(oldVnode)) {
    // empty mount (likely as component), create new root element
    isInitialPatch = true
    createElm(vnode, insertedVnodeQueue)
  } else {
    // ...
  }

  invokeInsertHook(vnode, insertedVnodeQueue, isInitialPatch)
  return vnode.elm
}
```

由于`oldVnode`是`undefined`，所以这里会命中`isUndef(oldVnode)`逻辑，直接执行`createElm`，注意此时是没有传入父节点的。

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
  if (isDef(vnode.elm) && isDef(ownerArray)) {
    // This vnode was used in a previous render!
    // now it's used as a new node, overwriting its elm would cause
    // potential patch errors down the road when it's used as an insertion
    // reference node. Instead, we clone the node on-demand before creating
    // associated DOM element for it.
    vnode = ownerArray[index] = cloneVNode(vnode)
  }

  vnode.isRootInsert = !nested // for transition enter check
  if (createComponent(vnode, insertedVnodeQueue, parentElm, refElm)) {
    return
  }

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
      if (isDef(data)) {
        invokeCreateHooks(vnode, insertedVnodeQueue)
      }
      insert(parentElm, vnode.elm, refElm)
    }

    if (process.env.NODE_ENV !== 'production' && data && data.pre) {
      creatingElmInVPre--
    }
  } else if (isTrue(vnode.isComment)) {
    vnode.elm = nodeOps.createComment(vnode.text)
    insert(parentElm, vnode.elm, refElm)
  } else {
    vnode.elm = nodeOps.createTextNode(vnode.text)
    insert(parentElm, vnode.elm, refElm)
  }
}
```

如上，这里和普通元素的挂载相同，先去创建占位符节点，这里的占位符节点是`App`组件内的根`div`，在将文本节点插入到这个占位符节点，由于没有父节点，此时占位符节点不能插入指定位置。

回到组件`patch`过程的开始`createComponent`：

```javascript
function createComponent(vnode, insertedVnodeQueue, parentElm, refElm) {
  let i = vnode.data
  if (isDef(i)) {
    const isReactivated = isDef(vnode.componentInstance) && i.keepAlive
    if (isDef(i = i.hook) && isDef(i = i.init)) {
      i(vnode, false /* hydrating */)
    }
    // after calling the init hook, if the vnode is a child component
    // it should've created a child instance and mounted it. the child
    // component also has set the placeholder vnode's elm.
    // in that case we can just return the element and be done.
    if (isDef(vnode.componentInstance)) {
      initComponent(vnode, insertedVnodeQueue)
      insert(parentElm, vnode.elm, refElm)
      if (isTrue(isReactivated)) {
        reactivateComponent(vnode, insertedVnodeQueue, parentElm, refElm)
      }
      return true
    }
  }
}
```

这里，执行`insert`将上面的占位符节点插入到指定的父节点上。
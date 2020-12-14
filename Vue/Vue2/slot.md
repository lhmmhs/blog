版本2.6.11

`slot`源码解析。

父组件`App`：

```html
<base-layout>
    <template v-slot:header>
      <h1>{{header}}</h1>
    </template>
    
	<p>{{main}}</p>

    <template v-slot:footer>
      <p>{{footer}}</p>
    </template>
</base-layout>
```

编译后生成的`render`：

```javascript
with (this) {
    return _c('base-layout', {
        scopedSlots: _u([{
            key: "header",
            fn: function() {
                return [_c('h1', [_v(_s(title))])]
            },
            proxy: true
        }, {
            key: "footer",
            fn: function() {
                return [_v(_s(footer))]
            },
            proxy: true
        }])
    }, [_c('p', [_v(_s(main))])])
}
```

1. 在执行`render`的时候会执行`_u(resolveScopedSlots)`函数，将传入的数组转化为对象。

```javascript
export function resolveScopedSlots (
  fns: ScopedSlotsData, // see flow/vnode
  res?: Object,
  // the following are added in 2.6
  hasDynamicKeys?: boolean,
  contentHashKey?: number
): { [key: string]: Function, $stable: boolean } {
  res = res || { $stable: !hasDynamicKeys }
  for (let i = 0; i < fns.length; i++) {
    const slot = fns[i]
    if (Array.isArray(slot)) {
      resolveScopedSlots(slot, res, hasDynamicKeys)
    } else if (slot) {
      // marker for reverse proxying v-slot without scope on this.$slots
      if (slot.proxy) {
        slot.fn.proxy = true
      }
      res[slot.key] = slot.fn
    }
  }
  if (contentHashKey) {
    (res: any).$key = contentHashKey
  }
  return res
}
```

2. 在子组件实例化的过程，会执行`initInternalComponent`将父节点的`vnodeComponentOptions.children`赋值给组件实例。

```javascript
Vue.prototype._init = function (options?: Object) {

  // merge options
  if (options && options._isComponent) {
    // optimize internal component instantiation
    // since dynamic options merging is pretty slow, and none of the
    // internal component options needs special treatment.
    initInternalComponent(vm, options)
  }
    
  initRender(vm)
}

export function initInternalComponent (vm: Component, options: InternalComponentOptions) {
  opts._renderChildren = vnodeComponentOptions.children
}
```

3. 子组件实例化的过程还会去执行`initRender`的时候，会执行`resolveSlots`初始化`slots`挂载到`vm.$slots`，`resolveSlots`内部就遍历通过第2步拿到的`children`，初始化插槽对应`name`的内容，如果没有指定名称的插槽内容会被默认初始化`name`为`default`。

```javascript
export function initRender (vm: Component) {
  vm.$slots = resolveSlots(options._renderChildren, renderContext)
}

export function resolveSlots (
  children: ?Array<VNode>,
  context: ?Component
): { [key: string]: Array<VNode> } {
  if (!children || !children.length) {
    return {}
  }
  const slots = {}
  for (let i = 0, l = children.length; i < l; i++) {
    const child = children[i]
    const data = child.data
    // remove slot attribute if the node is resolved as a Vue slot node
    if (data && data.attrs && data.attrs.slot) {
      delete data.attrs.slot
    }
    // named slots should only be respected if the vnode was rendered in the
    // same context.
    if ((child.context === context || child.fnContext === context) &&
      data && data.slot != null
    ) {
      const name = data.slot
      const slot = (slots[name] || (slots[name] = []))
      if (child.tag === 'template') {
        slot.push.apply(slot, child.children || [])
      } else {
        slot.push(child)
      }
    } else {
      // 没有指定name
      (slots.default || (slots.default = [])).push(child)
    }
  }
  // ignore slots that contains only whitespace
  for (const name in slots) {
    if (slots[name].every(isWhitespace)) {
      delete slots[name]
    }
  }
  return slots
}
```



子组件`base-layout`：

```html
<div class="container">
  <header>
      <slot name="header"></slot>
  </header>
  <main>
      <slot></slot>
  </main>
  <footer>
      <slot name="footer"></slot>
  </footer>
</div>
```

编译后的`render`：

```javascript
 with (this) {
     return _c(
         'div', 
         { staticClass: "container"}, 
         [
           _c('header', [_t("header")], 2), 
           _c('main', [_t("default", [_v("默认内容")])], 2),
           _c('footer', [_t("footer")], 2)
     	 ]
     )
}
```

4. 子组件在`render`之前，会执行`normalizeScopedSlots`把父节点的`scopedSlots`和`vm.$slots`以及`vm.$scopedSlots`合并，挂载到`vm.$scopedSlots`上。
5. 子组件`render`过程中，会执行`_t(renderSlot)`，初始化组件中包裹内容的`vnode`，分为2中情况，首先从`$scopedSlots`根据`name`获取对应的`scopedSlotFn`，如果存在，执行这个函数，并传入对应的`props`，这个`props`就是子组件中初始化的数据，这样就可以在父组件中获取到子组件的数据；如果不存在，根据`name`从`this.$slots`查找对应的`vnode`。

```javascript
Vue.prototype._render = function (): VNode {

  if (_parentVnode) {
    vm.$scopedSlots = normalizeScopedSlots(
      _parentVnode.data.scopedSlots,
      vm.$slots,
      vm.$scopedSlots
    )
  }
  
  return vnode
}

export function renderSlot (
  name: string,
  fallback: ?Array<VNode>,
  props: ?Object,
  bindObject: ?Object
): ?Array<VNode> {
  const scopedSlotFn = this.$scopedSlots[name]
  let nodes
  if (scopedSlotFn) { // scoped slot
    props = props || {}
    if (bindObject) {
      if (process.env.NODE_ENV !== 'production' && !isObject(bindObject)) {
        warn(
          'slot v-bind without argument expects an Object',
          this
        )
      }
      props = extend(extend({}, bindObject), props)
    }
    nodes = scopedSlotFn(props) || fallback
  } else {
    nodes = this.$slots[name] || fallback
  }

  const target = props && props.slot
  if (target) {
    return this.$createElement('template', { slot: target }, nodes)
  } else {
    return nodes
  }
}
```

### 总结

1. 组件包含的内容在父组件`render`阶段不会直接生成对应的`vnode`，而是被保存在组件`vnode`的`data`中的`scopedSlots`属性上，如果是默认的具名插槽，它会在父组件的`render`阶段生成`vnode`。
2. 子组件在初始化阶段会初始化`$slots`
3. 子组件在渲染前会整合`_parentVNode.data.scopedSlots`和`vm.$slots`以及`vm.$scopedSlots`挂载到`vm.$scopedSlots`上，供`render`阶段使用。
4. 作用域插槽是指，父组件使用子组件内的数据，子组件的数据是在子组件实例化过程中完成的，在子组件`render`阶段会传入父组件`scopedSlots`中定义的插槽函数，这样就可以在父组件中拿到子组件数据。


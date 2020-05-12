Vue的更新过程就是常说的`patch`：

```javascript
return function patch (oldVnode, vnode, hydrating, removeOnly) {

  if (isUndef(vnode)) {
    if (isDef(oldVnode)) invokeDestroyHook(oldVnode)
    return
  }

  let isInitialPatch = false
  const insertedVnodeQueue = []

  if (isUndef(oldVnode)) {
    // ...
  } else {
    if (!isRealElement && sameVnode(oldVnode, vnode)) {
      // 新旧vnode相同
      patchVnode(oldVnode, vnode, insertedVnodeQueue, null, null, removeOnly)
    } else {
      // 新旧vnode不同
    }
    
    
  }

  // ...
}
```

`patch`更新分为两种情况：

1. 新旧`vnode`相同

2. 新旧`vnode`不同

`sameVnode`是判断新旧`vnode`是否相同的函数：

```javascript
function sameVnode (a, b) {
  return (
    a.key === b.key && (
      (
        a.tag === b.tag &&
        a.isComment === b.isComment &&
        isDef(a.data) === isDef(b.data) &&
        sameInputType(a, b)
      ) || (
        isTrue(a.isAsyncPlaceholder) &&
        a.asyncFactory === b.asyncFactory &&
        isUndef(b.asyncFactory.error)
      )
    )
  )
}
```

##  新旧`vnode`不同

```javascript
createElm(
  vnode,
  insertedVnodeQueue,
  // extremely rare edge case: do not insert if old element is in a
  // leaving transition. Only happens when combining transition +
  // keep-alive + HOCs. (#4590)
  oldElm._leaveCb ? null : parentElm,
  nodeOps.nextSibling(oldElm)
)

// update parent placeholder node element, recursively
if (isDef(vnode.parent)) {
  let ancestor = vnode.parent
  const patchable = isPatchable(vnode)
  while (ancestor) {
    for (let i = 0; i < cbs.destroy.length; ++i) {
      cbs.destroy[i](ancestor)
    }
    ancestor.elm = vnode.elm
    if (patchable) {
      for (let i = 0; i < cbs.create.length; ++i) {
        cbs.create[i](emptyNode, ancestor)
      }
      // #6513
      // invoke insert hooks that may have been merged by create hooks.
      // e.g. for directives that uses the "inserted" hook.
      const insert = ancestor.data.hook.insert
      if (insert.merged) {
        // start at index 1 to avoid re-invoking component mounted hook
        for (let i = 1; i < insert.fns.length; i++) {
          insert.fns[i]()
        }
      }
    } else {
      registerRef(ancestor)
    }
    ancestor = ancestor.parent
  }
}

// destroy old node
if (isDef(parentElm)) {
  removeVnodes([oldVnode], 0, 0)
} else if (isDef(oldVnode.tag)) {
  invokeDestroyHook(oldVnode)
}
```

新旧`vnode`不同的情况很简单，直接创建新`vnode`对应的`DOM`并挂载，然后修改占位符`vnode`，最后删除旧`vnode`对应的`DOM`。

修改占位符`vnode`，举个例子，

```html
<!-- App.vue -->
<template>
  <Foo v-if="flag" ></Foo>
  <Bar v-else ></Bar>
</template>

<!-- Foo.vue -->
<template>
  <div>Foo</div>
</template>

<!-- Bar.vue -->
<template>
  <div>Bar</div>
</template>
```

更改`flag`后，会渲染`Bar`组件，删除`Foo`组件，在删除`Foo`组件之前，新的`vnode`的`parent`，也就是`App`组件的`vnode`，它的`elm`是`Foo`的根节点`<div>`，需要改变为`Bar`的根节点`<div>`，这么做的原因是，`App`组件是没有根节点的，这个根节点一般是用来挂载组件内其他节点使用，它的根节点是组件`Foo`或`Bar`，所以它的根节点是`Foo`或`Bar`的根`<div>`，**只有组件的根节点`vnode`有占位符`vnode`。**

## 新旧`vnode`相同

相同情况下，会执行`patchVnode`：

```javascript
function patchVnode (
  oldVnode,
  vnode,
  insertedVnodeQueue,
  ownerArray,
  index,
  removeOnly
) {
  if (oldVnode === vnode) {
    return
  }

  // ...
      
  if (isDef(data) && isDef(i = data.hook) && isDef(i = i.prepatch)) {
     // 组件
  }
  
  // ...
      
      
  if (isDef(data) && isPatchable(vnode)) {
    // 普通元素 vnodeData
  }
  
  if (isUndef(vnode.text)) {
    // 普通元素 children
  } else if (oldVnode.text !== vnode.text) {
    // 文本
  }
  
  // ...
}
```

新旧`vnode`相同的情况下，会分为三种情况：

1. 组件`vnode`
2. 普通元素`vnode`
3. 文本`vnode`

### 文本`vnode`

```javascript
else if (oldVnode.text !== vnode.text) {
  nodeOps.setTextContent(elm, vnode.text)
}

function setTextContent (node, text) {
  node.textContent = text;
}
```

文本`vnode`更新非常简单，当他们的文本不相同，直接将老文本节点的`textContent`替换为新的文本。

### 普通元素`vnode`

首先，要说明一下，标签不同的普通元素属于**新旧`vnode`不同**的情况，也就是说，它们应该执行**新旧`vnode`不同**的更新策略。

如果标签相同，那么新旧`vnode`的差异只能在`vnodeData`和`children`上了。

#### `vnodeData`

```javascript
if (isDef(data) && isPatchable(vnode)) {
  for (i = 0; i < cbs.update.length; ++i) cbs.update[i](oldVnode, vnode)
  if (isDef(i = data.hook) && isDef(i = i.update)) i(oldVnode, vnode)
}
```

`vnodeData`的更新，是通过执行`cbs`中各种`module`的`update`完成的，举个例子：

```html
<template>
  <div class="box" :style="style"></div>
</template>
```

```javascript
export default {
  name: "app",
  data() {
    return {
      style: {
        width: '100px',
        height: '100px',
        background: 'red'
      }
    }
  },
  mounted() {
    setTimeout(() => {
      this.style =  {
        width: '100px',
        height: '100px',
        background: 'yellow'
      }
    }, 5000)
  }
}
```

修改了整个`style`样式，Vue会通过执行`updateStyle`执行更新：

```javascript
function updateStyle (oldVnode: VNodeWithData, vnode: VNodeWithData) {
  const data = vnode.data
  const oldData = oldVnode.data

  // ...

  for (name in oldStyle) {
    if (isUndef(newStyle[name])) {
      setProp(el, name, '')
    }
  }
  for (name in newStyle) {
    cur = newStyle[name]
    if (cur !== oldStyle[name]) {
      // ie9 setting to null has no effect, must use empty string
      setProp(el, name, cur == null ? '' : cur)
    }
  }
}
```

遍历旧`vnode`上的样式对象，如果有属性不存在于新`vnode`的样式对象上，就在真实的`DOM`上清空这个样式属性的值，然后遍历新`vnode`上的样式对象，将新的样式应用到真实`DOM`上。

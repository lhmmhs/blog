版本v2.6.11

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

### 组件`vnode`

组件`vnode`的更新，本质上是组件内的真实`DOM`的更新。

```javascript
let i
const data = vnode.data
if (isDef(data) && isDef(i = data.hook) && isDef(i = i.prepatch)) {
  i(oldVnode, vnode)
}
```

组件`vnode`的更新会执行`prepatch`钩子函数，

```javascript
prepatch (oldVnode: MountedComponentVNode, vnode: MountedComponentVNode) {
  const options = vnode.componentOptions
  const child = vnode.componentInstance = oldVnode.componentInstance
  updateChildComponent(
    child,
    options.propsData, // updated props
    options.listeners, // updated listeners
    vnode, // new parent vnode
    options.children // new children
  )
}
```
将旧的`vnode`对应的组件实例赋值给新`vnode`，然后执行`updateChildComponent`
```javascript
export function updateChildComponent (
  vm: Component,
  propsData: ?Object,
  listeners: ?Object,
  parentVnode: MountedComponentVNode,
  renderChildren: ?Array<VNode>
) {
  // ...

  // update props
  if (propsData && vm.$options.props) {
    toggleObserving(false)
    const props = vm._props
    const propKeys = vm.$options._propKeys || []
    for (let i = 0; i < propKeys.length; i++) {
      const key = propKeys[i]
      const propOptions: any = vm.$options.props // wtf flow?
      props[key] = validateProp(key, propOptions, propsData, vm)
    }
    // ...
  }

  // ...

  // resolve slots + force update if has children
  if (needsForceUpdate) {
    vm.$slots = resolveSlots(renderChildren, parentVnode.context)
    vm.$forceUpdate()
  }

  // ...
}

Vue.prototype.$forceUpdate = function () {
  const vm: Component = this
  if (vm._watcher) {
    vm._watcher.update()
  }
}
```

这里有2个关键的步骤：

1. `props[key] = validateProp(key, propOptions, propsData, vm)`
2. `vm.$forceUpdate()`

`props[key]`的赋值会触发组件内`props`的`setter`从而触发组件内的真实`DOM`的更新。

`vm.$forceUpdate`的执行，就是组件的渲染`watcher`去执行`update`，将该`watcher`推入到更新的异步队列中，等待更新。

### 文本`vnode`

```javascript
else if (oldVnode.text !== vnode.text) {
  nodeOps.setTextContent(elm, vnode.text)
}

function setTextContent (node, text) {
  node.textContent = text;
}
```

文本`vnode`更新非常简单，当它们的文本不相同，直接将老文本节点的`textContent`替换为新的文本。

### 普通元素`vnode`

首先，要说明一下，标签不同的普通元素属于**新旧`vnode`不同**的情况，也就是说，它们应该执行**新旧`vnode`不同**的更新策略。

如果标签相同，那么新旧`vnode`的差异只能表现在`vnodeData`和`children`上了。

`vnodeData`的差异：

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

`children`的差异：

```javascript
const oldCh = oldVnode.children
const ch = vnode.children

if (isUndef(vnode.text)) {
  if (isDef(oldCh) && isDef(ch)) {
    if (oldCh !== ch) updateChildren(elm, oldCh, ch, insertedVnodeQueue, removeOnly)
  } else if (isDef(ch)) {
    if (isDef(oldVnode.text)) nodeOps.setTextContent(elm, '')
    addVnodes(elm, null, ch, 0, ch.length - 1, insertedVnodeQueue)
  } else if (isDef(oldCh)) {
    removeVnodes(oldCh, 0, oldCh.length - 1)
  } else if (isDef(oldVnode.text)) {
    nodeOps.setTextContent(elm, '')
  }
} 
```

`children`的差异分为三种情况：

1. `oldCh`与`ch`都存在
2. 只有`ch`存在
3. 只有`oldCh`存在

第二和第三这两种情况比较简单，举个例子说明一下：

```html
<template>
    <div v-if="flag">你好</div>
    <div v-else></div>
</template>
```

当`flag`改变为`false`时，`oldCh`存在，而`ch`不存在，直接清空`oldCh`即可。

相反，当`flag`改变为`true`时，只有`ch`存在，而`oldCh`不存在，直接添加`ch`即可。

### 核心Diff

`oldCh`与`ch`都存在，是最复杂的情况，它会执行`updateChildren`：

```javascript
function updateChildren (parentElm, oldCh, newCh, insertedVnodeQueue, removeOnly) {
  let oldStartIdx = 0
  let newStartIdx = 0
  let oldEndIdx = oldCh.length - 1
  let oldStartVnode = oldCh[0]
  let oldEndVnode = oldCh[oldEndIdx]
  let newEndIdx = newCh.length - 1
  let newStartVnode = newCh[0]
  let newEndVnode = newCh[newEndIdx]
  let oldKeyToIdx, idxInOld, vnodeToMove, refElm

  // removeOnly is a special flag used only by <transition-group>
  // to ensure removed elements stay in correct relative positions
  // during leaving transitions
  const canMove = !removeOnly

  if (process.env.NODE_ENV !== 'production') {
    checkDuplicateKeys(newCh)
  }

  while (oldStartIdx <= oldEndIdx && newStartIdx <= newEndIdx) {
    if (isUndef(oldStartVnode)) {
      oldStartVnode = oldCh[++oldStartIdx] // Vnode has been moved left
    } else if (isUndef(oldEndVnode)) {
      oldEndVnode = oldCh[--oldEndIdx]
    } else if (sameVnode(oldStartVnode, newStartVnode)) {
      patchVnode(oldStartVnode, newStartVnode, insertedVnodeQueue, newCh, newStartIdx)
      oldStartVnode = oldCh[++oldStartIdx]
      newStartVnode = newCh[++newStartIdx]
    } else if (sameVnode(oldEndVnode, newEndVnode)) {
      patchVnode(oldEndVnode, newEndVnode, insertedVnodeQueue, newCh, newEndIdx)
      oldEndVnode = oldCh[--oldEndIdx]
      newEndVnode = newCh[--newEndIdx]
    } else if (sameVnode(oldStartVnode, newEndVnode)) { // Vnode moved right
      patchVnode(oldStartVnode, newEndVnode, insertedVnodeQueue, newCh, newEndIdx)
      canMove && nodeOps.insertBefore(parentElm, oldStartVnode.elm, nodeOps.nextSibling(oldEndVnode.elm))
      oldStartVnode = oldCh[++oldStartIdx]
      newEndVnode = newCh[--newEndIdx]
    } else if (sameVnode(oldEndVnode, newStartVnode)) { // Vnode moved left
      patchVnode(oldEndVnode, newStartVnode, insertedVnodeQueue, newCh, newStartIdx)
      canMove && nodeOps.insertBefore(parentElm, oldEndVnode.elm, oldStartVnode.elm)
      oldEndVnode = oldCh[--oldEndIdx]
      newStartVnode = newCh[++newStartIdx]
    } else {
      if (isUndef(oldKeyToIdx)) oldKeyToIdx = createKeyToOldIdx(oldCh, oldStartIdx, oldEndIdx)
      idxInOld = isDef(newStartVnode.key)
        ? oldKeyToIdx[newStartVnode.key]
        : findIdxInOld(newStartVnode, oldCh, oldStartIdx, oldEndIdx)
      if (isUndef(idxInOld)) { // New element
        createElm(newStartVnode, insertedVnodeQueue, parentElm, oldStartVnode.elm, false, newCh, newStartIdx)
      } else {
        vnodeToMove = oldCh[idxInOld]
        if (sameVnode(vnodeToMove, newStartVnode)) {
          patchVnode(vnodeToMove, newStartVnode, insertedVnodeQueue, newCh, newStartIdx)
          oldCh[idxInOld] = undefined
          canMove && nodeOps.insertBefore(parentElm, vnodeToMove.elm, oldStartVnode.elm)
        } else {
          // same key but different element. treat as new element
          createElm(newStartVnode, insertedVnodeQueue, parentElm, oldStartVnode.elm, false, newCh, newStartIdx)
        }
      }
      newStartVnode = newCh[++newStartIdx]
    }
  }
  if (oldStartIdx > oldEndIdx) {
    refElm = isUndef(newCh[newEndIdx + 1]) ? null : newCh[newEndIdx + 1].elm
    addVnodes(parentElm, refElm, newCh, newStartIdx, newEndIdx, insertedVnodeQueue)
  } else if (newStartIdx > newEndIdx) {
    removeVnodes(oldCh, oldStartIdx, oldEndIdx)
  }
}
```

这个函数是Vue `diff`核心，它首先分别获取`oldCh`和`newCh`的首位和末位的索引以及对应的元素。

```javascript
let oldStartIdx = 0
let newStartIdx = 0
let oldEndIdx = oldCh.length - 1
let newEndIdx = newCh.length - 1

let oldStartVnode = oldCh[0]
let oldEndVnode = oldCh[oldEndIdx]
let newStartVnode = newCh[0]
let newEndVnode = newCh[newEndIdx]
```

获取到对应元素后，就会进行比较：

1. `oldCh`首位元素和`newCh`首位元素对比
2. `oldCh`末位元素和`newCh`末位元素对比
3. `oldCh`首位元素和`newCh`末位元素对比
4. `oldCh`末位元素和`newCh`首位元素对比

```javascript
while (oldStartIdx <= oldEndIdx && newStartIdx <= newEndIdx) {
  if (isUndef(oldStartVnode)) {
      // ...
  } else if (isUndef(oldEndVnode)) {
      // ...
  } else if (sameVnode(oldStartVnode, newStartVnode)) {
      // 1.`oldCh`首位元素和`newCh`首位元素对比
    patchVnode(oldStartVnode, newStartVnode, insertedVnodeQueue, newCh, newStartIdx)
    oldStartVnode = oldCh[++oldStartIdx]
    newStartVnode = newCh[++newStartIdx]
  } else if (sameVnode(oldEndVnode, newEndVnode)) {
      // 2.`oldCh`末位元素和`newCh`末位元素对比
    patchVnode(oldEndVnode, newEndVnode, insertedVnodeQueue, newCh, newEndIdx)
    oldEndVnode = oldCh[--oldEndIdx]
    newEndVnode = newCh[--newEndIdx]
  } else if (sameVnode(oldStartVnode, newEndVnode)) { // Vnode moved right
      // 3.`oldCh`首位元素和`newCh`末位元素对比
    patchVnode(oldStartVnode, newEndVnode, insertedVnodeQueue, newCh, newEndIdx)
    canMove && nodeOps.insertBefore(parentElm, oldStartVnode.elm, nodeOps.nextSibling(oldEndVnode.elm))
    oldStartVnode = oldCh[++oldStartIdx]
    newEndVnode = newCh[--newEndIdx]
  } else if (sameVnode(oldEndVnode, newStartVnode)) { // Vnode moved left
      // 4.`oldCh`末位元素和`newCh`首位元素对比
    patchVnode(oldEndVnode, newStartVnode, insertedVnodeQueue, newCh, newStartIdx)
    canMove && nodeOps.insertBefore(parentElm, oldEndVnode.elm, oldStartVnode.elm)
    oldEndVnode = oldCh[--oldEndIdx]
    newStartVnode = newCh[++newStartIdx]
  } else {
      // ...
  }
}
```

这个对比的过程就是，在**当前对比范围内**找到**索引不同**的**相同节点**，进行移动。

举个例子：

```html
<template>
  <ul>
    <li v-for="item in list" :key="item.id" >{{item.val}}</li>
  </ul>
</template>
```

```javascript
// oldCh和newCh中都是vnode
// 这里简写为vnode对应的数据

// oldCh 
[
  {id: 0, val: 'A'}, // oldStartVnode oldStartIdx
  {id: 1, val: 'B'},
  {id: 2, val: 'C'},
  {id: 3, val: 'D'}  // oldEndVnode oldEndIdx
]

// newCh
[
  {id: 3, val: 'D'}, // newStartVnode newStartIdx
  {id: 1, val: 'B'},
  {id: 0, val: 'A'},
  {id: 2, val: 'C'}  // newEndVnode newEndIdx
]
```

对应的`Dom`

```html
<ul>
  <li>A</li>
  <li>B</li>
  <li>C</li>
  <li>D</li>
</ul>
```

第一次对比，

1. `sameVnode(oldStartVnode, newStartVnode)`，不同
2. `sameVnode(oldEndVnode, newEndVnode)`，不同
3. `sameVnode(oldStartVnode, newEndVnode)`，不同
4. `sameVnode(oldEndVnode, newStartVnode)`，相同

`oldEndVnode`和`newStartVnode`为相同的节点，说明`oldEndVnode`所对应的真实`DOM`原本是末位，更新后是首位，把`oldEndVnode`对应的`DOM` `D`元素移动到`oldStartVnode`对应`DOM` `A`元素的前面，更新状态：

```javascript
// oldCh 
[
  {id: 0, val: 'A'}, // oldStartVnode  oldStartIdx
  {id: 1, val: 'B'}, 
  {id: 2, val: 'C'}, // oldEndVnode oldEndIdx
  {id: 3, val: 'D'}  
]

// newCh
[
  {id: 3, val: 'D'}, 
  {id: 1, val: 'B'}, // newStartVnode newStartIdx
  {id: 0, val: 'A'}, 
  {id: 2, val: 'C'}  // newEndVnode newEndIdx
]
```

对应的`Dom`

```html
<ul>
  <li>D</li>
  <li>A</li>
  <li>B</li>
  <li>C</li>
</ul>
```

第二次对比，

1. `sameVnode(oldStartVnode, newStartVnode)`，不同
2. `sameVnode(oldEndVnode, newEndVnode)`，相同

`oldEndVnode`和`newEndVnode`为相同的节点，但是这个两个节点都是**当前对比范围**内的末位元素，所以不需要移动，只需要更新状态：

```javascript
// oldCh 
[
  {id: 0, val: 'A'}, // oldStartVnode  oldStartIdx
  {id: 1, val: 'B'}, // oldEndVnode oldEndIdx
  {id: 2, val: 'C'}, 
  {id: 3, val: 'D'}  
]

// newCh
[
  {id: 3, val: 'D'}, 
  {id: 1, val: 'B'}, // newStartVnode newStartIdx
  {id: 0, val: 'A'}, // newEndVnode newEndIdx
  {id: 2, val: 'C'}  
]
```

第三次对比，

1. `sameVnode(oldStartVnode, newStartVnode)`，不同
2. `sameVnode(oldEndVnode, newEndVnode)`，不同
3. `sameVnode(oldStartVnode, newEndVnode)`，相同

`oldStartVnode`和`newEndVnode`为相同的节点，说明`oldStartVnode`对应`DOM`原本在首位，但是现在在**对比范围内**的末位，把`oldStartVnode`对应的`DOM`  `A`元素移动到`oldEndVnode`对应`DOM`  `B`元素的后面，更新状态：

```javascript
// oldCh 
[
  {id: 0, val: 'A'}, 
  {id: 1, val: 'B'}, // oldStartVnode oldStartIdx oldEndVnode oldEndIdx
  {id: 2, val: 'C'}, 
  {id: 3, val: 'D'}  
]

// newCh
[
  {id: 3, val: 'D'}, 
  {id: 1, val: 'B'}, // newStartVnode newStartIdx newEndVnode newEndIdx
  {id: 0, val: 'A'}, 
  {id: 2, val: 'C'}  
]
```

真实`DOM`

```html
<ul>
  <li>D</li>
  <li>B</li>
  <li>A</li>
  <li>C</li>
</ul>
```

第四次对比，

1. `sameVnode(oldStartVnode, newStartVnode)`，相同

`oldStartVnode`和`newStartVnode`为相同的节点，但是这个两个节点都是**当前对比范围**内的首位元素，所以不需要移动，更新状态：

```javascript
// oldCh 
[
  {id: 0, val: 'A'},
  {id: 1, val: 'B'}, // oldEndVnode oldEndIdx
  {id: 2, val: 'C'}, // oldStartVnode oldStartIdx
  {id: 3, val: 'D'}  
]

// newCh
[
  {id: 3, val: 'D'}, 
  {id: 1, val: 'B'}, // newEndVnode newEndIdx
  {id: 0, val: 'A'}, // newStartVnode newStartIdx
  {id: 2, val: 'C'}  
]
```

第四次对比过后，`oldStartIdx`大于`oldEndIdx`，会终止比较，更新完成。

### 特殊情况

```javascript
// oldCh 
[
  {id: 0, val: 'A'}, // oldStartVnode oldStartIdx
  {id: 1, val: 'B'}, 
  {id: 2, val: 'C'}, 
  {id: 3, val: 'D'}  // oldEndVnode oldEndIdx
]

// newCh
[
  {id: 1, val: 'B'}, // newStartVnode newStartIdx
  {id: 3, val: 'D'}, 
  {id: 0, val: 'A'}, 
  {id: 2, val: 'C'}  // newEndVnode newEndIdx
]
```

对于上面这个例子，是不会命中之前四种对比中的任意一个的，那么它会命中下面这个逻辑：

```javascript
else {
  if (isUndef(oldKeyToIdx)) oldKeyToIdx = createKeyToOldIdx(oldCh, oldStartIdx, oldEndIdx)
  idxInOld = isDef(newStartVnode.key)
    ? oldKeyToIdx[newStartVnode.key]
    : findIdxInOld(newStartVnode, oldCh, oldStartIdx, oldEndIdx)
  if (isUndef(idxInOld)) { // New element
    createElm(newStartVnode, insertedVnodeQueue, parentElm, oldStartVnode.elm, false, newCh, newStartIdx)
  } else {
    vnodeToMove = oldCh[idxInOld]
    if (sameVnode(vnodeToMove, newStartVnode)) {
      patchVnode(vnodeToMove, newStartVnode, insertedVnodeQueue, newCh, newStartIdx)
      oldCh[idxInOld] = undefined
      canMove && nodeOps.insertBefore(parentElm, vnodeToMove.elm, oldStartVnode.elm)
    } else {
      // same key but different element. treat as new element
      createElm(newStartVnode, insertedVnodeQueue, parentElm, oldStartVnode.elm, false, newCh, newStartIdx)
    }
  }
  newStartVnode = newCh[++newStartIdx]
}
```

首先，遍历`oldCh`，将每个元素的`key`和元素索引建立一个映射，通过`newCh`中的第一个元素的`key`去这个映射中找到对应的索引，如果没找到，说明是新的元素，直接创建新元素并挂载；如果找到了，进行对比，如果是相同节点，说明`oldCh`中的这个节点所对应的真实`DOM`在`newCh`中是首位，把这个节点对应的真实`DOM`移动到`oldStartVnode`前面，同时将`oldCh`这个位置的元素重置为`undefined`，这样在下一轮比较中，遇到`undefined`会直接跳过，最后进行索引更新。

### 添加新元素

```javascript
// oldCh 
[
  {id: 0, val: 'A'}, // oldStartVnode oldStartIdx
  {id: 1, val: 'B'}, 
  {id: 2, val: 'C'}  // oldEndVnode oldEndIdx
]

// newCh
[
  {id: 0, val: 'A'}, // newStartVnode newStartIdx
  {id: 1, val: 'B'}, 
  {id: 2, val: 'C'}, 
  {id: 3, val: 'D'}  // newEndVnode newEndIdx
]
```

对于上面这个例子，会进行三轮对比，而且全部命中`sameVnode(oldStartVnode, newStartVnode)`，经过三轮对比后，`oldStartIdx`已经大于`oldEndIdx`，所以进入下面这个逻辑，

```javascript
if (oldStartIdx > oldEndIdx) {
  refElm = isUndef(newCh[newEndIdx + 1]) ? null : newCh[newEndIdx + 1].elm
  addVnodes(parentElm, refElm, newCh, newStartIdx, newEndIdx, insertedVnodeQueue)
}
```

获取`refElm`元素，如果存在，说明新元素在某个元素之前，反之就是在末位，最后通过`addVnodes`遍历所有剩余的新元素依次创建并挂载到指定位置。

### 删除不存在的旧元素

```javascript
// oldCh
[
  {id: 0, val: 'A'}, // oldStartVnode oldStartIdx
  {id: 1, val: 'B'}, 
  {id: 2, val: 'C'}, 
  {id: 3, val: 'D'}  // oldEndVnode oldEndIdx
]

// newCh
[
  {id: 0, val: 'A'}, // newStartVnode newStartIdx 
  {id: 1, val: 'B'}, 
  {id: 2, val: 'C'}  // newEndVnode newEndIdx 
]
```

对于上面这个例子，同样会进行三轮对比，而且全部命中`sameVnode(oldStartVnode, newStartVnode)`，当第三轮对比结束，`newStartIdx`已经大于`newEndIdx`，所以不会继续对比，而是命中下面这个逻辑：

```javascript
else if (newStartIdx > newEndIdx) {
  removeVnodes(oldCh, oldStartIdx, oldEndIdx)
}
```

通过`removeVnodes`遍历所有的`oldCh`剩余范围内的元素，依次删除。

### key的作用

`Diff`算法的核心，就是进行新旧`vnode`的比对，找到相同节点，进行移动。

相同节点的依据首要要素就是`key`，如果元素没有`key`，那么就不能进行真实`DOM`的复用。

最开始的案例：

```html
<template>
  <ul>
    <li v-for="item in list">{{item.val}}</li>
  </ul>
</template>
```

```javascript
// oldCh 
[
  {id: 0, val: 'A'}, // oldStartVnode oldStartIdx
  {id: 1, val: 'B'},
  {id: 2, val: 'C'},
  {id: 3, val: 'D'}  // oldEndVnode oldEndIdx
]

// newCh
[
  {id: 3, val: 'D'}, // newStartVnode newStartIdx
  {id: 1, val: 'B'},
  {id: 0, val: 'A'},
  {id: 2, val: 'C'}  // newEndVnode newEndIdx
]
```

此时新旧所有`vnode`都是没有`key`属性的，那么当进行第一次比较的时候会：

1. `sameVnode(oldStartVnode, newStartVnode)`，相同

`sameVnode`会判定`oldStartVnode`和`newStartVnode`为相同节点，`sameVnode`：

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

根据`sameVnode`实现，相同节点的第一要素就是`key`，而此时的新旧`vnode`的`key`都为`undefined`，会继续判断`tag`，`isComment`，`data`，以及`input`类型，这4个条件，对于此时的新旧`vnode`全部满足，所以认为它们是相同的节点，这时候会递归执行`patchVnode`进行它们之间的比对，进而比对它们的子节点，新的`li`子节点是`D`文本`vnode`，旧的`li`子节点是`A`文本`vnode`，最终会将`A`更新为`D`。

当进行第二次比较时，依然会命中`sameVnode(oldStartVnode, newStartVnode)`，虽然此时新旧子节点的文本相同，但是本质上是没有变化的，类似的第三次，第四次都会执行相同的逻辑，来更新文本，这就是没有的`key`情况下，执行的逻辑，显然，没有`key`相比有`key`会造成更多`DOM`操作。


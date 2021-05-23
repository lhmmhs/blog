公司的后台系统中有这么1个页面，它是1个卡列表的页面，每1张卡可能会有上百个`input`框，这就导致了在`input`框输入内容的时候会出现卡顿的情况，如果是连续输入内容卡顿的情况更加严重。

这是因为该页面数据量太大，请求接口的TTFB通常也是4s以上，这就导致生成的dom太多，每次输入1个数字就会进行1次diff，如果是连续输入，那么就会进行多次diff，卡顿是肯定少不了的。

知道了原因，看下面这个案例：

```html
// cardList.vue
<template>
	<ul class="card-list">
    <li class="card" v-for="card in cardList">
      <div class="card-package" v-for="package in card.packages">
        <label>套餐名称</label>
      	<input v-model="package.name" />
      	<label>套餐价格</label>
      	<input v-model="package.price" />
      </div>
    </li>
  </ul>
</template>
```

上面这个组件，如果只有1张卡，卡里包含了50个套餐，那组件最终渲染会有100个`input`框，当我们在每次输入价格的时候，都会进行diff，diff的过程：

1. 对比新旧ul的vnode
2. 对比新旧li的vnode
3. 对比新旧div的vnode
4. 对比新旧label的vnode
5. 对比新旧label内文本节点的vnode
6. 对比新旧input的vnode
7. 对比新旧label的vnode
8. 对比新旧label内文本节点的vnode
9. 对比新旧input的vnode
10. 重复2-9步骤49次

这个量级的diff，会使js执行时间过长，导致渲染被阻塞，出现卡顿的现象。

如何减少diff的vnode数量是问题的关键点，也就是说如果在`input`框内输入新的内容时，diff只比对新旧`input`的vnode，那么就可以大大的减少diff的时间。

**diff的比对就是对1个组件内的所有vnode进行的比对，那么只有将组件内的vnode减少，就可以减少diff比对的时间。**

将`input`框抽离成1个组件，这样在每次在`input`输入内容的时候，diff只会比对`input`框组件内部的vnode。

```html
// my-input.vue
<template>
	<input v-model="package[packageKey]" />
</template>

// cardList.vue
<template>
	<ul class="card-list">
    <li class="card" v-for="card in cardList">
      <div class="card-package" v-for="package in card.packages">
        <label>套餐名称</label>
      	<my-input :package="package" packagekey="name" />
      	<label>套餐价格</label>
      	<my-input :package="package" packagekey="price" />
      </div>
    </li>
  </ul>
</template>
```

现在，在`input`框内输入新的内容时，diff就只会比对`my-input`组件内的`input`对应的vnode。

```html	
// my-input.vue
<template>
	<input :value="value" @input="$emit('input', $event.target.value)"  />
</template>

// cardList.vue
<template>
	<ul class="card-list">
    <li class="card" v-for="card in cardList">
      <div class="card-package" v-for="package in card.packages">
        <label>套餐名称</label>
      	<my-input v-model="package.name" />
      	<label>套餐价格</label>
      	<my-input v-model="package.price" />
      </div>
    </li>
  </ul>
</template>
```

如果是上面这种写法，那么diff比对依然会是`cardList`组件内的所有vnode，而切还会让diff时间延长，因为组件vnode需要深入组件内部进行diff。为什么会出现上面这种情况呢？这是因为数据收集的渲染`watcher`不同。

第1种写法，数据是`package[packageKey]`，它收集的是`my-input`组件的渲染`watcher`，diff只是比对组件内的`input`的vnode。

第2种写法，数据是`package.name`和`package.price`，它们收集的是`cardList`组件的渲染`watcher`，diff比对组件内所有的vnode。

那么，第1种diff肯定比第2种diff快的多的多。

#### 参考文章

1. [为什么说 Vue 的响应式更新精确到组件级别？（原理深度解析）](https://juejin.cn/post/6844904113432444942)
2. [揭秘 Vue.js 九个性能优化技巧](https://juejin.cn/post/6922641008106668045)


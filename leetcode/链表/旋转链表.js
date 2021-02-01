// 链表首尾相连成环，找新的的头部和尾部
var rotateRight = function (head, k) {
  let n = 0
  let cur = head
  let oldTail = null
  let newTail = null
  let newHead = null
  while (cur) {
    oldTail = cur
    cur = cur.next
    n++
  }
  oldTail.next = head
  newTail = head
  // 关键点：新链表的结尾 n - k % n - 1
  for (let i = 0; i < n - (k % n) - 1; i++) {
    newTail = newTail.next
  }
  newHead = newTail.next
  newTail.next = null
  return newHead
}

let linkedList = {
  val: 1,
  next: {
    val: 2,
    next: {
      val: 3,
      next: {
        val: 4,
        next: {
          val: 5,
          next: null,
        },
      },
    },
  },
}

// console.log(rotateRight(linkedList, 2))

// console.log(0 % 2)

// 双指针
function rotateRight1(head, k) {
  let r = head
  let l = head
  let cur = head
  let n = 0
  while (cur) {
    cur = cur.next
    n++
  }
  // 如果k>n，取余
  k %= n
  for (let i = 0; i < k; i++) {
    r = r.next
  }
  console.log(r.next)
  while (r.next) {
    r = r.next
    l = l.next
  }
  // 尾部指向头部
  r.next = head
  // 新头部
  head = l.next
  // 新尾部
  l.next = null
  return head
}

console.log(rotateRight1(linkedList, 2))

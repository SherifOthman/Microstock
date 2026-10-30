// Comprehensive DOM patch to prevent NotFoundError crashes in React when browser translation (Google Translate, Edge Translate) or browser extensions mutate or wrap DOM text/elements.
if (typeof Node !== 'undefined' && Node.prototype) {
  const originalRemoveChild = Node.prototype.removeChild;
  Node.prototype.removeChild = function <T extends Node>(child: T): T {
    try {
      if (child.parentNode !== this) {
        if (child.parentNode) {
          return child.parentNode.removeChild(child);
        }
        return child;
      }
      return originalRemoveChild.call(this, child) as T;
    } catch {
      return child;
    }
  };

  const originalInsertBefore = Node.prototype.insertBefore;
  Node.prototype.insertBefore = function <T extends Node>(newNode: T, referenceNode: Node | null): T {
    try {
      if (referenceNode && referenceNode.parentNode !== this) {
        // If referenceNode has another parent or has been wrapped by translator, append to `this` or find nearest common ancestor
        if (referenceNode.parentNode && referenceNode.parentNode.contains(this)) {
          return referenceNode.parentNode.insertBefore(newNode, referenceNode) as T;
        }
        // Fallback: safely appendChild on `this`
        return this.appendChild(newNode);
      }
      return originalInsertBefore.call(this, newNode, referenceNode) as T;
    } catch {
      try {
        return this.appendChild(newNode);
      } catch {
        return newNode;
      }
    }
  };

  const originalReplaceChild = Node.prototype.replaceChild;
  Node.prototype.replaceChild = function <T extends Node>(newChild: Node, oldChild: T): T {
    try {
      if (oldChild.parentNode !== this) {
        if (oldChild.parentNode) {
          return oldChild.parentNode.replaceChild(newChild, oldChild) as T;
        }
        this.appendChild(newChild);
        return oldChild;
      }
      return originalReplaceChild.call(this, newChild, oldChild) as T;
    } catch {
      try {
        this.appendChild(newChild);
      } catch {
        // ignore
      }
      return oldChild;
    }
  };
}

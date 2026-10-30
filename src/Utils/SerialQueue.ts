// Runs tasks one at a time in the order they were added; a rejected task does not stop the ones after it
export class SerialQueue {
  private tail: Promise<unknown> = Promise.resolve()
  private waiting = 0

  // Tasks added but not started yet
  public get length() {
    return this.waiting
  }

  public add<T>(task: () => Promise<T>): Promise<T> {
    this.waiting++
    const run = this.tail.then(() => {
      this.waiting--
      return task()
    })
    this.tail = run.catch(() => undefined)
    return run
  }
}

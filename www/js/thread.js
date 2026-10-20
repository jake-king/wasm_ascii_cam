export class ThreadPool{
    constructor(script, size) {
        this.threads = [];
        this.tasks = [];
        for (var ithread = 0; ithread < size; ithread++) {
            this.threads.push(new Thread(script, this));
            this.threads[ithread].worker.postMessage({init:'init'});
        }
    }

    queueTask(message, callback) {
        const task = {task: message, callback: callback};
        if (this.threads.length > 0) {
          let thread = this.threads.shift();
          thread.run(task);
        } else {
          this.tasks.push(task);
        }
    }

    afterTask(thread) {
        if (this.tasks.length > 0) {
          thread.run(this.tasks.shift());
        } else {
          this.threads.push(thread);
        }
    }
}

export class Thread {
    constructor(script, pool) {
        this.worker = new Worker(script);
        this.worker.addEventListener('message', this.onmessage.bind(this));
        this.pool = pool;
        this.callback = null;
    }

    run(task) {
        this.callback = task.callback;
        this.worker.postMessage(task.task);
    }

    onmessage(message) {
        const callback = this.callback;
        this.callback = null;
        callback.collect(message.data);
        this.pool.afterTask(this);
    }
}
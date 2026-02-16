export interface SerialTaskQueue {
  enqueue(task: () => Promise<void>): Promise<void>;
  clear(): void;
}

interface PendingTask {
  run: () => Promise<void>;
  resolve: () => void;
  reject: (reason: unknown) => void;
}

export function createSerialTaskQueue(): SerialTaskQueue {
  const pendingTasks: PendingTask[] = [];
  let isDraining = false;

  async function drainPendingTasks(): Promise<void> {
    if (isDraining) {
      return;
    }

    isDraining = true;
    try {
      while (pendingTasks.length > 0) {
        const nextTask = pendingTasks.shift();
        if (!nextTask) {
          continue;
        }

        try {
          await nextTask.run();
          nextTask.resolve();
        } catch (error) {
          nextTask.reject(error);
        }
      }
    } finally {
      isDraining = false;
    }
  }

  return {
    enqueue(task): Promise<void> {
      return new Promise<void>((resolve, reject) => {
        pendingTasks.push({
          run: task,
          resolve,
          reject,
        });
        void drainPendingTasks();
      });
    },
    clear(): void {
      while (pendingTasks.length > 0) {
        const task = pendingTasks.shift();
        task?.resolve();
      }
    },
  };
}

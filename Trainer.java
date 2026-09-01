class TrainingThread extends Thread {
    private NeuralNetwork network;
    private double[][] inputs;
    private double[] outputs;
    private int firstRow;
    private int lastRow;
    private double learningRate;
    private double totalSquaredError;

    TrainingThread(NeuralNetwork network, double[][] inputs, double[] outputs,
                   int firstRow, int lastRow, double learningRate) {
        this.network = network;
        this.inputs = inputs;
        this.outputs = outputs;
        this.firstRow = firstRow;
        this.lastRow = lastRow;
        this.learningRate = learningRate;
    }

    public void run() {
        totalSquaredError = 0;
        for (int row = firstRow; row < lastRow; row++) {
            totalSquaredError = totalSquaredError +
                    network.trainOneExample(inputs[row], outputs[row], learningRate);
        }
    }

    double getTotalSquaredError() {
        return totalSquaredError;
    }
}

class Trainer {
    private NeuralNetwork network;

    Trainer(NeuralNetwork network) {
        this.network = network;
    }

    void train(double[][] inputs, double[] outputs, int numberOfExamples,
               int epochs, double learningRate) {
        for (int epoch = 0; epoch < epochs; epoch++) {
            int middleRow = numberOfExamples / 2;
            TrainingThread firstWorker = new TrainingThread(
                    network, inputs, outputs, 0, middleRow, learningRate);
            TrainingThread secondWorker = new TrainingThread(
                    network, inputs, outputs, middleRow, numberOfExamples, learningRate);

            firstWorker.start();
            try {
                firstWorker.join();
            } catch (InterruptedException exception) {
                System.out.println("Training was interrupted.");
                return;
            }

            secondWorker.start();
            try {
                secondWorker.join();
            } catch (InterruptedException exception) {
                System.out.println("Training was interrupted.");
                return;
            }

            double totalSquaredError = firstWorker.getTotalSquaredError() +
                    secondWorker.getTotalSquaredError();
            double averageLoss = Functions.meanSquaredError(totalSquaredError, numberOfExamples);

            if (epoch % 10 == 0 || epoch == epochs - 1) {
                System.out.printf("Epoch %d - average loss: %.4f%n", epoch, averageLoss);
            }
        }
    }
}

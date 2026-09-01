public class Main {
    public static void main(String[] args) throws Exception {
        final String CSV_PATH = "sleep_health_data.csv";
        final int[] FEATURE_COLUMNS = {0, 1, 2, 3, 4, 5};
        final int TARGET_COLUMN = 6;

        Dataset dataset = new Dataset();
        dataset.loadFromCsv(CSV_PATH, FEATURE_COLUMNS, TARGET_COLUMN);

        double[][] inputs = dataset.getInputs();
        double[] outputs = dataset.getOutputs();
        int trainingSize = (int) (dataset.getSize() * 0.8);

        NeuralNetwork network = new NeuralNetwork(FEATURE_COLUMNS.length);
        Trainer trainer = new Trainer(network);
        trainer.train(inputs, outputs, trainingSize, 200, 0.01);

        double totalSquaredError = 0;
        for (int row = trainingSize; row < dataset.getSize(); row++) {
            double prediction = network.predict(inputs[row]);
            double error = prediction - outputs[row];
            totalSquaredError = totalSquaredError + error * error;
            System.out.printf("Predicted: %.2f | Actual: %.2f%n", prediction, outputs[row]);
        }
        double testLoss = Functions.meanSquaredError(
                totalSquaredError, dataset.getSize() - trainingSize);
        System.out.printf("Test MSE: %.4f%n", testLoss);
    }
}

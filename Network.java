class NeuralNetwork {
    private double[] weights;
    private double bias;

    NeuralNetwork(int numberOfInputs) {
        weights = new double[numberOfInputs];
        bias = 0;
    }

    double predict(double[] inputs) {
        double prediction = bias;
        for (int index = 0; index < weights.length; index++) {
            prediction = prediction + weights[index] * inputs[index];
        }
        return prediction;
    }

    double trainOneExample(double[] inputs, double actualOutput, double learningRate) {
        double prediction = predict(inputs);
        double error = prediction - actualOutput;

        for (int index = 0; index < weights.length; index++) {
            weights[index] = weights[index] - learningRate * 2 * error * inputs[index];
        }
        bias = bias - learningRate * 2 * error;
        return error * error;
    }
}

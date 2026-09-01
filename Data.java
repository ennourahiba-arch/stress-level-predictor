import java.io.BufferedReader;
import java.io.FileReader;
import java.io.IOException;

class Dataset {
    private double[][] inputs;
    private double[] outputs;

    void loadFromCsv(String csvPath, int[] featureColumns, int targetColumn) throws IOException {
        int numberOfRows = countRows(csvPath);
        inputs = new double[numberOfRows][featureColumns.length];
        outputs = new double[numberOfRows];

        BufferedReader reader = new BufferedReader(new FileReader(csvPath));
        reader.readLine();
        String line = reader.readLine();
        int row = 0;

        while (line != null) {
            if (!line.trim().isEmpty()) {
                String[] columns = line.split(",");
                for (int column = 0; column < featureColumns.length; column++) {
                    inputs[row][column] = Double.parseDouble(columns[featureColumns[column]].trim());
                }
                outputs[row] = Double.parseDouble(columns[targetColumn].trim());
                row++;
            }
            line = reader.readLine();
        }
        reader.close();
        normalizeInputs();
    }

    private int countRows(String csvPath) throws IOException {
        BufferedReader reader = new BufferedReader(new FileReader(csvPath));
        reader.readLine();
        int numberOfRows = 0;
        String line = reader.readLine();

        while (line != null) {
            if (!line.trim().isEmpty()) {
                numberOfRows++;
            }
            line = reader.readLine();
        }
        reader.close();
        return numberOfRows;
    }

    private void normalizeInputs() {
        for (int column = 0; column < inputs[0].length; column++) {
            double smallest = inputs[0][column];
            double largest = inputs[0][column];

            for (int row = 1; row < inputs.length; row++) {
                if (inputs[row][column] < smallest) {
                    smallest = inputs[row][column];
                }
                if (inputs[row][column] > largest) {
                    largest = inputs[row][column];
                }
            }

            for (int row = 0; row < inputs.length; row++) {
                double range = largest - smallest;
                if (range == 0) {
                    inputs[row][column] = 0;
                } else {
                    inputs[row][column] = (inputs[row][column] - smallest) / range;
                }
            }
        }
    }

    double[][] getInputs() {
        return inputs;
    }

    double[] getOutputs() {
        return outputs;
    }

    int getSize() {
        return inputs.length;
    }
}

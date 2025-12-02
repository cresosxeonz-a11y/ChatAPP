import java.util.Scanner;

public class newe{
    public static void main(String[] args) {
        Scanner input = new Scanner(System.in);
        int a = input.nextInt();
        int b = input.nextInt();
        int c = input.nextInt();

        if (a > b && a > c) {
            System.out.println("A is the greatest of all numbers.");
        } else if (b > a && b > c) {
            System.out.println("B is the greates of all numbers.");
        } else {
            System.out.println("C is the greates of all numbers.");
        }
    }
}
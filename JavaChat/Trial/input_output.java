//Simple example of receiving input from the user and displaying output in Java.
import java.util.Scanner; // Like #include in C for importing libraries

public class input_output { // Main class that handles input and output

    public static void main(String[] args) // Main method - Entry point of the program
    {
        Scanner message = new Scanner(System.in);//Creates a Scanner object - Constructor
        // Direct Message so no questions
        System.out.print("YOur Message :");//Prints the message text

        
        String userMessage = message.nextLine();// Take input from user
        
        System.out.println("You entered: " + userMessage);// Displaying the user input
        message.close();
        //For real time applications we just pass the userMessage to other functions or modules.
    }
}
import pyodbc

def create_database():
    connection_string = "Driver={ODBC Driver 17 for SQL Server};Server=localhost;UID=sa;PWD=sa123;"
    
    try:
        # Autocommit is required to create a database
        conn = pyodbc.connect(connection_string, autocommit=True)
        cursor = conn.cursor()
        
        # Check if database exists
        cursor.execute("SELECT name FROM master.dbo.sysdatabases WHERE name = N'becon_db'")
        if not cursor.fetchone():
            print("Creating database becon_db...")
            cursor.execute("CREATE DATABASE becon_db")
            print("Database created successfully.")
        else:
            print("Database becon_db already exists.")
            
        cursor.close()
        conn.close()
    except Exception as e:
        print(f"Error creating database: {e}")

if __name__ == "__main__":
    create_database()

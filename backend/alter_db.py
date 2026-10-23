import pyodbc

def alter_database():
    connection_string = "Driver={ODBC Driver 17 for SQL Server};Server=localhost;Database=becon_db;UID=sa;PWD=sa123;"
    
    try:
        conn = pyodbc.connect(connection_string, autocommit=True)
        cursor = conn.cursor()
        
        # Add password_hash column if it doesn't exist
        cursor.execute("""
        IF COL_LENGTH('user_profiles', 'password_hash') IS NULL
        BEGIN
            ALTER TABLE user_profiles ADD password_hash VARCHAR(500) NULL
            PRINT 'password_hash column added.'
        END
        ELSE
        BEGIN
            PRINT 'password_hash column already exists.'
        END
        """)
            
        cursor.close()
        conn.close()
    except Exception as e:
        print(f"Error altering database: {e}")

if __name__ == "__main__":
    alter_database()

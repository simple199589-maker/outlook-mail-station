import sqlite3

db = r"D:\work\python\outlook-mail-station\data\outlook_mail_station.db"
conn = sqlite3.connect(db)
cur = conn.cursor()
print(cur.execute("select name from sqlite_master where type='table' order by name").fetchall())
print(cur.execute("select id, username, role, enabled from station_users order by id").fetchall())
conn.close()

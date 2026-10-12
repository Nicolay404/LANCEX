"""Dominio puro del motor de subastas (ADR-0005).

Python puro: PROHIBIDO importar django o leer el reloj del sistema. La hora llega como
parámetro (`now`) desde los servicios, que la obtienen de PostgreSQL.
"""
